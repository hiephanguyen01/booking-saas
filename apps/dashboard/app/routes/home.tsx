import { Link } from 'react-router';

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-gray-600">
        Chọn khu vực làm việc ở thanh bên — đăng nhập và phân quyền menu theo vai trò sẽ vào ở
        Phase 1 (BFF auth).
      </p>
      <Link to="/admin" className="mt-4 inline-block text-sky-700 underline">
        Vào khu Platform Admin
      </Link>
    </div>
  );
}
