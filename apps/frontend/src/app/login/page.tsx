'use client';

import { AlertCircle, ArrowRight, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/toast';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('superadmin@lemiex.vn');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const user = await login(email, password);
      showToast({ title: 'Đăng nhập thành công', description: `Xin chào ${user.displayName}.`, tone: 'success' });
      router.replace(user.roles.some((role) => role.code === 'SUPER_ADMIN') ? '/super-admin/access' : user.permissions.includes('organization.view') ? '/admin' : '/overview');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể đăng nhập');
      showToast({ title: 'Đăng nhập không thành công', description: requestError instanceof Error ? requestError.message : 'Kiểm tra lại thông tin đăng nhập.', tone: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#edf5ff] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 top-24 size-80 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -bottom-24 right-0 size-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3"><div className="grid size-10 place-items-center rounded-md bg-brand"><Sparkles className="size-5" /></div><div><p className="font-extrabold">Workzen</p><p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Workforce OS</p></div></div>
        <div className="relative max-w-xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-200">Identity & access</p>
          <h1 className="mt-5 text-4xl font-black leading-tight tracking-[-0.05em]">Đúng người. Đúng quyền.<br />Đúng phạm vi công việc.</h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-white/55">Quản trị nhân sự, lịch làm việc và dữ liệu vận hành trên một nền tảng được kiểm soát theo vai trò.</p>
          <div className="mt-9 grid grid-cols-3 gap-px overflow-hidden border border-white/10 bg-white/10">
            {['Phân quyền RBAC', 'Kiểm soát API', 'Theo dõi truy cập'].map((label, index) => <div key={label} className="bg-sidebar/90 p-4"><p className="font-mono text-lg font-bold text-blue-200">0{index + 1}</p><p className="mt-2 text-xs font-semibold text-white/65">{label}</p></div>)}
          </div>
        </div>
        <p className="relative text-xs text-white/30">Lemiex · Workforce Management System</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <form onSubmit={submit} className="w-full max-w-[430px] border border-line bg-white p-7 shadow-[0_24px_70px_rgba(32,76,125,0.12)] sm:p-9">
          <div className="grid size-11 place-items-center rounded-md bg-info-soft text-brand"><ShieldCheck className="size-5" /></div>
          <h2 className="mt-6 text-2xl font-black tracking-[-0.04em]">Đăng nhập hệ thống</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Sử dụng tài khoản đã được quản trị viên cấp quyền.</p>

          <label className="mt-7 block"><span className="mb-2 block text-xs font-extrabold">Email</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" /></label>
          <label className="mt-4 block"><span className="mb-2 block text-xs font-extrabold">Mật khẩu</span><div className="relative"><KeyRound className="absolute left-3 top-3.5 size-4 text-muted" /><input required minLength={8} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-md border border-line pl-10 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" /></div></label>

          {error && <div className="mt-4 flex items-start gap-2 border border-danger/20 bg-danger-soft px-3 py-2.5 text-xs font-semibold text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}</div>}

          <Button type="submit" variant="brand" className="mt-6 h-11 w-full" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Đăng nhập</Button>
          <p className="mt-5 text-center text-[11px] text-muted">Liên hệ Super Admin nếu tài khoản bị khóa hoặc thiếu quyền truy cập.</p>
        </form>
      </section>
    </main>
  );
}
