export type TourTarget = {
  selectors?: string[];
  text?: string[];
  within?: string;
};

export type TourStepDefinition = {
  title: string;
  description: string;
  target?: TourTarget;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

export type ProductTourDefinition = {
  id: string;
  version: number;
  title: string;
  steps: TourStepDefinition[];
};

const pageTitle: TourTarget = {
  selectors: [
    '[data-tour="page-content"] h1',
    '[data-tour="page-content"] h2',
    '[data-tour="page-content"] header',
  ],
};

const pageContent: TourTarget = { selectors: ['[data-tour="page-content"]'] };
const firstSummary: TourTarget = {
  selectors: [
    '[data-tour="page-content"] section',
    '[data-tour="page-content"] article',
  ],
};
const firstTable: TourTarget = {
  selectors: [
    '[data-tour="page-content"] table',
    '[data-tour="page-content"] [role="table"]',
  ],
};
const firstFilter: TourTarget = {
  selectors: [
    '[data-tour="page-content"] input[type="search"]',
    '[data-tour="page-content"] input[placeholder*="Tìm"]',
    '[data-tour="page-content"] select',
  ],
};

const action = (...text: string[]): TourTarget => ({
  within: '[data-tour="page-content"]',
  selectors: ['button', 'a'],
  text,
});

const nav = (href: string): TourTarget => ({
  selectors: [`[data-tour-nav="${href}"]`],
});

function tour(
  id: string,
  title: string,
  introduction: string,
  steps: TourStepDefinition[],
): ProductTourDefinition {
  return {
    id,
    version: 1,
    title,
    steps: [
      { title, description: introduction },
      {
        title: "Mục đích của màn hình",
        description:
          "Tiêu đề và phần mô tả cho biết công việc chính cần hoàn thành tại đây.",
        target: pageTitle,
        side: "bottom",
        align: "start",
      },
      ...steps,
      {
        title: "Có thể xem lại bất cứ lúc nào",
        description:
          "Bấm Hướng dẫn trên thanh công cụ để mở lại tour của đúng màn hình hiện tại.",
        target: { selectors: ['[data-tour="help"]'] },
        side: "bottom",
        align: "end",
      },
    ],
  };
}

export const productTours: Record<string, ProductTourDefinition> = {
  "/admin": tour(
    "admin-overview",
    "Tổng quan vận hành",
    "Theo dõi tình trạng thiết lập, nhân sự, ca làm và các việc đang chờ xử lý trong ngày.",
    [
      {
        title: "Thiết lập lần đầu",
        description:
          "Khi hệ thống còn trống, hoàn thành các bước theo thứ tự để những form sau có đủ dữ liệu lựa chọn.",
        target: action("Tạo chi nhánh", "Thiết lập"),
      },
      {
        title: "Các chỉ số cần chú ý",
        description:
          "Khu vực này tóm tắt nhân viên, người đang làm, số ca và yêu cầu đang chờ.",
        target: firstSummary,
        side: "bottom",
      },
      {
        title: "Đi đến phân hệ",
        description:
          "Menu chỉ hiển thị các chức năng tài khoản của bạn được phép sử dụng.",
        target: nav("/admin/employees"),
        side: "right",
      },
    ],
  ),
  "/admin/employees": tour(
    "employee-management",
    "Quản lý nhân viên",
    "Tạo hồ sơ nhân viên, cấp tài khoản, theo dõi công tác, mức lương và quyền truy cập.",
    [
      {
        title: "Thêm nhân viên",
        description:
          "Bắt đầu hồ sơ mới tại đây. Form sẽ kiểm tra email, mã nhân viên và dữ liệu tổ chức bắt buộc.",
        target: action("Thêm nhân viên", "Tạo nhân viên"),
      },
      {
        title: "Tìm và lọc",
        description:
          "Thu hẹp danh sách theo từ khóa, trạng thái, chi nhánh hoặc phòng ban. Bộ lọc được lưu trên URL.",
        target: firstFilter,
      },
      {
        title: "Danh sách và hồ sơ",
        description:
          "Chọn một dòng để xem hồ sơ đầy đủ, lịch sử công tác, lương và quyền truy cập.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/admin/schedule": tour(
    "schedule-planner",
    "Lịch và phân ca",
    "Lập lịch theo ngày, tuần hoặc tháng; gán nhân viên, kiểm tra xung đột và công bố lịch.",
    [
      {
        title: "Tạo ca làm",
        description:
          "Tạo ca mới với thời gian, địa điểm, phòng ban, vị trí và số lượng nhân sự cần thiết.",
        target: action("Tạo ca", "Thêm ca"),
      },
      {
        title: "Chế độ xem lịch",
        description:
          "Chuyển khoảng thời gian và kiểu hiển thị phù hợp trước khi sắp xếp hoặc sao chép lịch.",
        target: action("Ngày", "Tuần", "Tháng"),
      },
      {
        title: "Phân ca trực quan",
        description:
          "Kéo thả ca đến thời điểm phù hợp hoặc chọn ca để gán nhân viên và xem cảnh báo vận hành.",
        target: pageContent,
      },
      {
        title: "Công bố lịch",
        description:
          "Chỉ lịch đã công bố mới xuất hiện cho nhân viên và được dùng làm căn cứ chấm công.",
        target: action("Công bố"),
      },
    ],
  ),
  "/admin/shift-swaps": tour(
    "shift-swap-review",
    "Duyệt đổi ca",
    "Theo dõi yêu cầu đổi hoặc nhường ca, kiểm tra người thay thế và đưa ra quyết định.",
    [
      {
        title: "Trạng thái yêu cầu",
        description:
          "Dùng các tab để tập trung vào yêu cầu đang chờ người nhận hoặc chờ quản lý duyệt.",
        target: action("Chờ", "Tất cả"),
      },
      {
        title: "Điều kiện thay thế",
        description:
          "Mỗi yêu cầu hiển thị ca, người đề nghị, người thay thế và các điều kiện hợp lệ trước khi duyệt.",
        target: firstSummary,
      },
      {
        title: "Quyết định có kiểm soát",
        description:
          "Duyệt sẽ cập nhật lịch tự động; từ chối phải giữ nguyên lịch hiện tại và lưu lịch sử.",
        target: action("Duyệt", "Từ chối"),
      },
    ],
  ),
  "/admin/attendance/live": tour(
    "live-attendance",
    "Theo dõi ca theo thời gian thực",
    "Quan sát số người đang làm, đang nghỉ, chưa check-in hoặc thiếu check-out theo từng ca.",
    [
      {
        title: "Tình trạng hiện tại",
        description:
          "Các chỉ số đầu trang giúp nhận biết nhanh ca thiếu người hoặc có trạng thái cần xử lý.",
        target: firstSummary,
      },
      {
        title: "Lọc đúng phạm vi",
        description:
          "Chọn chi nhánh, phòng ban hoặc ca để quản lý đúng nhóm nhân viên phụ trách.",
        target: firstFilter,
      },
      {
        title: "Chi tiết từng người",
        description:
          "Danh sách cho biết ai đang làm, đang break, chưa vào ca hoặc đã kết thúc ca.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/admin/attendance": tour(
    "attendance-anomalies",
    "Bất thường chấm công",
    "Tập trung các trường hợp đi muộn, về sớm, thiếu check-in/out, sai GPS và nghỉ quá giờ.",
    [
      {
        title: "Tổng quan bất thường",
        description:
          "Các chỉ số phản ánh mức độ và loại bất thường trong phạm vi đang chọn.",
        target: firstSummary,
      },
      {
        title: "Bộ lọc điều tra",
        description:
          "Lọc theo thời gian, nhân viên, loại và trạng thái để tìm đúng bản ghi cần kiểm tra.",
        target: firstFilter,
      },
      {
        title: "Cách tính và lịch sử",
        description:
          "Mở một bản ghi để xem dữ liệu lịch, thời gian thực tế, GPS và lịch sử tính lại.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/admin/timesheets": tour(
    "timesheets",
    "Quản lý bảng công",
    "Tổng hợp giờ làm từ lịch và chấm công, điều chỉnh có lý do, duyệt rồi khóa dữ liệu.",
    [
      {
        title: "Kỳ và phạm vi",
        description:
          "Chọn khoảng thời gian, chi nhánh hoặc phòng ban trước khi tổng hợp và đối chiếu.",
        target: firstFilter,
      },
      {
        title: "Số liệu tổng hợp",
        description:
          "Theo dõi giờ dự kiến, thực tế, break và overtime trước khi phê duyệt.",
        target: firstSummary,
      },
      {
        title: "Quy trình bảng công",
        description:
          "Bảng công đi qua các bước tổng hợp, điều chỉnh, duyệt và khóa. Mọi thay đổi đều có lịch sử.",
        target: firstTable,
        side: "top",
      },
      {
        title: "Xuất dữ liệu",
        description:
          "Xuất dữ liệu sau khi đã lọc đúng kỳ và kiểm tra trạng thái bảng công.",
        target: action("Xuất"),
      },
    ],
  ),
  "/admin/leave": tour(
    "leave-management",
    "Quản lý nghỉ phép",
    "Cấu hình loại nghỉ và hạn mức, theo dõi số dư, tiếp nhận rồi duyệt yêu cầu nghỉ.",
    [
      {
        title: "Chọn nghiệp vụ",
        description:
          "Chuyển giữa loại nghỉ, số dư và yêu cầu để tránh hiển thị quá nhiều dữ liệu cùng lúc.",
        target: action("Loại nghỉ", "Số dư", "Yêu cầu"),
      },
      {
        title: "Cấu hình loại nghỉ",
        description:
          "Xác định đơn vị ngày/giờ, có lương, theo dõi số dư và quy tắc phê duyệt.",
        target: action("Thêm loại nghỉ", "Tạo loại nghỉ"),
      },
      {
        title: "Danh sách cần xử lý",
        description:
          "Kiểm tra số dư, khoảng thời gian và xung đột lịch trước khi duyệt hoặc từ chối.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/admin/payroll": tour(
    "payroll-management",
    "Quản lý tiền lương",
    "Quản lý mức lương, quy tắc tính, kỳ lương và quy trình kiểm tra đến ghi nhận thanh toán.",
    [
      {
        title: "Chọn phân hệ lương",
        description:
          "Dùng các tab để làm việc lần lượt với mức lương, quy tắc, kỳ lương và bảng lương.",
        target: action("Mức lương", "Quy tắc", "Kỳ lương"),
      },
      {
        title: "Tạo kỳ lương",
        description:
          "Kỳ lương phải có thời gian rõ ràng và chỉ tính từ bảng công đã đủ điều kiện.",
        target: action("Tạo kỳ", "Thêm kỳ"),
      },
      {
        title: "Kiểm tra trước khi khóa",
        description:
          "Đối chiếu lỗi, cảnh báo, phụ cấp, thưởng và khấu trừ trước khi duyệt hoặc khóa kỳ.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/admin/reports": tour(
    "reports",
    "Báo cáo và phân tích",
    "Phân tích từng nghiệp vụ bằng dữ liệu thực, cùng một phạm vi thời gian và đơn vị tổ chức.",
    [
      {
        title: "Chọn đúng báo cáo",
        description:
          "Mỗi tab có dữ liệu và công thức riêng; chỉ chọn báo cáo phù hợp với câu hỏi cần trả lời.",
        target: action("Nhân sự", "Lịch", "Giờ làm", "Chấm công"),
      },
      {
        title: "Phạm vi dữ liệu",
        description:
          "Bộ lọc thời gian, chi nhánh và phòng ban được áp dụng thống nhất cho chỉ số và bảng chi tiết.",
        target: firstFilter,
      },
      {
        title: "Đọc từ tổng quan đến chi tiết",
        description:
          "Xem chỉ số chính trước, sau đó dùng bảng chi tiết để xác minh nguyên nhân.",
        target: firstSummary,
      },
      {
        title: "Xuất báo cáo",
        description:
          "Tệp xuất sử dụng đúng báo cáo và bộ lọc đang hiển thị.",
        target: action("Xuất"),
      },
    ],
  ),
  "/admin/organization": tour(
    "organization",
    "Tổ chức và chi nhánh",
    "Thiết lập chi nhánh, GPS, giờ hoạt động, phòng ban và vị trí trước khi tạo nhân viên hoặc lịch.",
    [
      {
        title: "Chọn loại dữ liệu",
        description:
          "Chuyển giữa chi nhánh, phòng ban và vị trí. Nên cấu hình theo đúng thứ tự này trong lần đầu.",
        target: action("Chi nhánh", "Phòng ban", "Vị trí"),
      },
      {
        title: "Tạo dữ liệu tổ chức",
        description:
          "Mã được hệ thống tự sinh; bạn chỉ cần nhập thông tin nghiệp vụ cần thiết.",
        target: action("Thêm chi nhánh", "Thêm phòng ban", "Thêm vị trí"),
      },
      {
        title: "GPS và bản đồ",
        description:
          "Tìm địa chỉ hoặc kéo ghim; vòng bán kính thay đổi theo giới hạn chấm công đã nhập.",
        target: { selectors: ['.leaflet-container'] },
      },
      {
        title: "Danh sách cấu hình",
        description:
          "Chọn một bản ghi để xem chi tiết, chỉnh sửa hoặc ngừng hoạt động mà không làm mất lịch sử.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/overview": tour(
    "employee-overview",
    "Tổng quan cá nhân",
    "Xem ca gần nhất, trạng thái chấm công và các việc cá nhân cần chú ý.",
    [
      {
        title: "Ca làm tiếp theo",
        description:
          "Ca sắp tới hiển thị thời gian, địa điểm và hành động check-in khi đã đủ điều kiện.",
        target: firstSummary,
      },
      {
        title: "Đi nhanh đến công việc",
        description:
          "Dùng menu để mở lịch cá nhân, chấm công, nghỉ phép, đổi ca hoặc phiếu lương.",
        target: nav("/my-schedule"),
        side: "right",
      },
    ],
  ),
  "/my-schedule": tour(
    "personal-schedule",
    "Lịch làm việc của tôi",
    "Theo dõi ca đã công bố theo thời gian và mở chi tiết để xem đồng nghiệp cùng ca.",
    [
      {
        title: "Chọn khoảng thời gian",
        description:
          "Di chuyển giữa ngày, tuần hoặc tháng để xem lịch phù hợp với nhu cầu.",
        target: action("Hôm nay", "Tuần", "Tháng"),
      },
      {
        title: "Chi tiết ca",
        description:
          "Bấm vào một ca để xem địa điểm, thời gian, trạng thái và những người làm cùng.",
        target: firstSummary,
      },
      {
        title: "Check-in đúng ca",
        description:
          "Khi ca sắp bắt đầu và được phép chấm công, nút check-in sẽ dẫn đến màn chấm công.",
        target: action("Check-in", "Chấm công"),
      },
    ],
  ),
  "/attendance": tour(
    "personal-attendance",
    "Chấm công",
    "Check-in/out bằng ảnh selfie và GPS, đồng thời theo dõi break và lịch sử trong ngày.",
    [
      {
        title: "Vị trí hiện tại",
        description:
          "Bản đồ cho biết vị trí của bạn và vùng chấm công được cấu hình cho chi nhánh.",
        target: { selectors: ['.leaflet-container'] },
      },
      {
        title: "Hành động chấm công",
        description:
          "Hệ thống chỉ ghi nhận sau khi có GPS hợp lệ và ảnh selfie rõ mặt.",
        target: action("Check-in", "Check-out"),
      },
      {
        title: "Thời gian nghỉ",
        description:
          "Mỗi ca chỉ có một lần nghỉ; bắt đầu và kết thúc nghỉ đều phải ở trong vùng GPS.",
        target: action("Bắt đầu nghỉ", "Kết thúc nghỉ"),
      },
      {
        title: "Lịch sử phiên",
        description:
          "Phiên hiện tại chỉ hiển thị hoạt động của ca đang làm; phiên cũ nằm trong lịch sử.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/leave": tour(
    "personal-leave",
    "Nghỉ phép của tôi",
    "Kiểm tra số dư, xem lịch sử và gửi yêu cầu nghỉ theo ngày hoặc theo giờ.",
    [
      {
        title: "Số dư hiện tại",
        description:
          "Xem số phép được cấp, đã sử dụng, đang giữ chỗ và còn khả dụng theo từng loại nghỉ.",
        target: firstSummary,
      },
      {
        title: "Tạo yêu cầu nghỉ",
        description:
          "Chọn loại nghỉ và thời gian; hệ thống sẽ kiểm tra số dư, trùng yêu cầu và xung đột lịch.",
        target: action("Tạo yêu cầu", "Gửi yêu cầu"),
      },
      {
        title: "Theo dõi trạng thái",
        description:
          "Danh sách cho biết yêu cầu đang chờ, đã duyệt, bị từ chối hoặc đã hủy.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/shift-swaps": tour(
    "personal-shift-swaps",
    "Đổi ca của tôi",
    "Nhường hoặc đổi ca đã được phân, chọn người thay thế và theo dõi quá trình phê duyệt.",
    [
      {
        title: "Tạo yêu cầu",
        description:
          "Chọn ca cần đổi hoặc nhường, sau đó chọn nhân viên đủ điều kiện thay thế.",
        target: action("Tạo yêu cầu", "Đổi ca"),
      },
      {
        title: "Yêu cầu cần phản hồi",
        description:
          "Khi được chọn thay ca, bạn có thể chấp nhận hoặc từ chối trước khi quản lý duyệt.",
        target: firstSummary,
      },
      {
        title: "Lịch sử trạng thái",
        description:
          "Theo dõi từng bước từ khi gửi đến khi lịch được cập nhật hoặc yêu cầu bị hủy.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/payroll": tour(
    "personal-payroll",
    "Phiếu lương của tôi",
    "Xem các kỳ lương đã được công bố cùng chi tiết thu nhập, phụ cấp và khấu trừ.",
    [
      {
        title: "Chọn kỳ lương",
        description:
          "Chỉ kỳ đã được công bố mới xuất hiện. Chọn một kỳ để mở phiếu lương chi tiết.",
        target: firstSummary,
      },
      {
        title: "Chi tiết thu nhập",
        description:
          "Đối chiếu lương cơ bản, overtime, phụ cấp, thưởng, khấu trừ và số tiền thực nhận.",
        target: firstTable,
        side: "top",
      },
    ],
  ),
  "/super-admin": tour(
    "super-admin-overview",
    "Tổng quan hệ thống",
    "Theo dõi tình trạng dịch vụ, tài khoản, vai trò và hoạt động quản trị toàn hệ thống.",
    [
      {
        title: "Chỉ số hệ thống",
        description:
          "Các thẻ đầu trang giúp nhận biết nhanh quy mô tài khoản và trạng thái vận hành.",
        target: firstSummary,
      },
      {
        title: "Quản trị quyền",
        description:
          "Đi đến ma trận quyền để cấu hình vai trò và phạm vi chức năng.",
        target: nav("/super-admin/access"),
        side: "right",
      },
    ],
  ),
  "/super-admin/access": tour(
    "access-control",
    "Tài khoản và quyền",
    "Xem ma trận quyền theo vai trò và thay đổi quyền chức năng một cách có kiểm soát.",
    [
      {
        title: "Chọn vai trò",
        description:
          "Chọn role cần xem hoặc chỉnh sửa. Super Admin luôn được bảo vệ và có toàn quyền.",
        target: firstFilter,
      },
      {
        title: "Ma trận quyền",
        description:
          "Mỗi hàng là một quyền nghiệp vụ; mỗi cột là một vai trò. Có thể bật từng quyền hoặc cả nhóm.",
        target: firstTable,
        side: "top",
      },
      {
        title: "Lưu thay đổi",
        description:
          "Kiểm tra số quyền đã chọn và lưu để áp dụng cho những tài khoản mang vai trò đó.",
        target: action("Lưu"),
      },
    ],
  ),
};
