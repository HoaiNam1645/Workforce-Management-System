# Workforce Management

Monorepo quản lý nhân sự, lịch làm việc, chấm công và tiền lương.

## Công nghệ

- Backend: NestJS 12, TypeORM, PostgreSQL
- Frontend: Next.js 16, React 19, App Router
- Package manager: npm workspaces

## Chạy local với PostgreSQL đã cài trên máy

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
npm install
npm run db:setup
npm run dev
```

Lệnh `db:setup` tạo role/database `workforce` và nạp `csdl.sql`. Mặc định lệnh dùng
PostgreSQL admin trùng với user hiện tại của máy; có thể thay đổi bằng biến
`DATABASE_ADMIN_USER`.

## Chạy PostgreSQL bằng Docker

```bash
docker compose up -d
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000/api
- Health check: http://localhost:4000/api/health

Schema PostgreSQL trong `csdl.sql` chỉ được Docker chạy tự động khi volume được tạo lần đầu.

## Cấu trúc backend

Entity được nhóm theo domain trong `apps/backend/src/modules`:

```text
modules/
├── access-control/
├── attendance/
├── audit/
├── compliance/
├── core/
├── employees/
├── labor-costs/
├── leave/
├── notifications/
├── organization/
├── payroll/
├── schedules/
├── tasks/
└── timesheets/
```

Mỗi domain có thư mục `entities/` và một Nest module đăng ký entity bằng
`TypeOrmModule.forFeature()`. Toàn bộ module được import trong `AppModule`.

Sinh lại entity từ schema PostgreSQL hiện tại:

```bash
npm run entity:generate -w @workforce/backend
```

Entity được sinh tự động, vì vậy không chỉnh sửa trực tiếp file `*.entity.ts` nếu
thay đổi đó cần được giữ lâu dài. Hãy cập nhật `csdl.sql`, áp dụng migration và
sinh lại entity.

`apps/backend/src/database/data-source.ts` chỉ phục vụ TypeORM CLI và migration;
ứng dụng NestJS tự quản lý kết nối qua `TypeOrmModule.forRootAsync()`.
