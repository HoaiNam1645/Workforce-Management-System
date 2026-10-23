"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type Driver, type DriveStep } from "driver.js";
import { useAuth } from "@/components/auth/auth-provider";
import {
  productTours,
  type ProductTourDefinition,
  type TourTarget,
} from "./tour-definitions";

export const START_TOUR_EVENT = "workforce:start-tour";

function isVisible(element: Element) {
  const node = element as HTMLElement;
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

function resolveTarget(target?: TourTarget) {
  if (!target) return undefined;
  const root = target.within
    ? document.querySelector(target.within)
    : document;
  if (!root) return undefined;
  const selectors = target.selectors?.length ? target.selectors : ["*"];
  const expectedText = target.text?.map((item) => item.toLocaleLowerCase("vi"));

  for (const selector of selectors) {
    const elements = Array.from(root.querySelectorAll(selector));
    const match = elements.find((element) => {
      if (!isVisible(element)) return false;
      if (!expectedText?.length) return true;
      const content = element.textContent?.trim().toLocaleLowerCase("vi") ?? "";
      return expectedText.some((text) => content.includes(text));
    });
    if (match) return match;
  }
  return undefined;
}

function storageKey(userId: string, definition: ProductTourDefinition) {
  return `workforce:tour:${userId}:${definition.id}:v${definition.version}`;
}

function addSkipButton(
  popover: { footer: HTMLElement; footerButtons: HTMLElement },
  instance: Driver,
  onSkip: () => void,
) {
  if (popover.footer.querySelector("[data-tour-skip]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.tourSkip = "true";
  button.className = "workforce-tour-skip";
  button.textContent = "Bỏ qua";
  button.addEventListener("click", () => {
    onSkip();
    instance.destroy();
  });
  popover.footer.insertBefore(button, popover.footerButtons);
}

export function ProductTour() {
  const pathname = usePathname();
  const { user } = useAuth();
  const activeDriver = useRef<Driver | null>(null);
  const autoStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const definition = productTours[pathname];
    if (!user || !definition) return;

    const start = (manual = false) => {
      if (!manual && window.localStorage.getItem(storageKey(user.id, definition))) {
        return;
      }
      activeDriver.current?.destroy();
      const markCompleted = () =>
        window.localStorage.setItem(storageKey(user.id, definition), "done");
      let instance: Driver;
      const steps: DriveStep[] = definition.steps.map((step) => ({
        element: step.target ? () => resolveTarget(step.target) as Element : undefined,
        skipMissingElement: true,
        waitForElement: 1800,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
        },
      }));
      instance = driver({
        steps,
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        duration: 260,
        overlayColor: "#10243d",
        overlayOpacity: 0.74,
        smoothScroll: true,
        allowClose: true,
        allowScroll: true,
        overlayClickBehavior: "none",
        stagePadding: 9,
        stageRadius: 7,
        disableActiveInteraction: true,
        skipMissingElement: true,
        waitForElement: 1800,
        popoverClass: "workforce-tour-popover",
        popoverOffset: 14,
        showButtons: ["previous", "next", "close"],
        showProgress: true,
        progressText: "Bước {{current}}/{{total}}",
        nextBtnText: "Tiếp",
        prevBtnText: "Quay lại",
        doneBtnText: "Hoàn tất",
        closeBtnLabel: "Đóng hướng dẫn",
        onPopoverRender: (popover, options) =>
          addSkipButton(popover, options.driver, markCompleted),
        onDestroyed: (_element, _step, options) => {
          activeDriver.current = null;
          if (options.reason !== "api" && options.reason !== "replaced") {
            markCompleted();
          }
        },
      });
      activeDriver.current = instance;
      instance.drive();
    };

    const handleManualStart = () => start(true);
    window.addEventListener(START_TOUR_EVENT, handleManualStart);
    let readinessChecks = 0;
    const startWhenReady = () => {
      const status = document.querySelector("[data-tour-status]")?.getAttribute("data-tour-status");
      if (status === "blocked") return;
      if (status === "loading" && readinessChecks < 10) {
        readinessChecks += 1;
        autoStartTimer.current = setTimeout(startWhenReady, 500);
        return;
      }
      start(false);
    };
    autoStartTimer.current = setTimeout(startWhenReady, 1100);

    return () => {
      window.removeEventListener(START_TOUR_EVENT, handleManualStart);
      if (autoStartTimer.current) clearTimeout(autoStartTimer.current);
      activeDriver.current?.destroy();
      activeDriver.current = null;
    };
  }, [pathname, user]);

  return null;
}
