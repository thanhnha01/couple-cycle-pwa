export const routePaths = [
  "/login",
  "/register",
  "/forgot-password",
  "/onboarding",
  "/invite",
  "/home",
  "/calendar",
  "/history",
  "/insights",
  "/settings",
] as const;

export type RoutePath = (typeof routePaths)[number];

export interface AppRoute {
  path: RoutePath;
  title: string;
  eyebrow: string;
  description: string;
}

export const routes: readonly AppRoute[] = [
  { path: "/login", title: "Đăng nhập", eyebrow: "Tài khoản", description: "Đăng nhập để tiếp tục." },
  { path: "/register", title: "Tạo tài khoản", eyebrow: "Tài khoản", description: "Tạo tài khoản Nhịp Đôi riêng tư." },
  { path: "/forgot-password", title: "Đặt lại mật khẩu", eyebrow: "Tài khoản", description: "Yêu cầu liên kết đặt lại mật khẩu." },
  { path: "/onboarding", title: "Bắt đầu cùng nhau", eyebrow: "Khởi đầu", description: "Tạo không gian riêng hoặc nhận lời mời của người ấy." },
  { path: "/invite", title: "Mời người ấy", eyebrow: "Lời mời riêng tư", description: "Chỉ gửi liên kết này cho người ấy." },
  { path: "/home", title: "Hôm nay", eyebrow: "Hôm nay", description: "Tổng quan nhẹ nhàng dành cho hai bạn." },
  { path: "/calendar", title: "Lịch", eyebrow: "Chu kỳ", description: "Theo dõi lịch chu kỳ." },
  { path: "/history", title: "Nhật ký", eyebrow: "Dữ liệu", description: "Xem lại các lần đã ghi nhận." },
  { path: "/insights", title: "Khám phá", eyebrow: "Nhịp điệu", description: "Những gợi ý và dự đoán riêng cho bạn." },
  { path: "/settings", title: "Cá nhân", eyebrow: "Tùy chọn", description: "Quản lý không gian, riêng tư và thông báo." },
];

export const publicAuthPaths: readonly RoutePath[] = ["/login", "/register", "/forgot-password"];
export const protectedPaths: readonly RoutePath[] = ["/onboarding", "/invite", "/home", "/calendar", "/history", "/insights", "/settings"];
