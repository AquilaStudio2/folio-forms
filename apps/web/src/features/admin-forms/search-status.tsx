import { Spinner } from "@/components/ui/spinner";

interface SearchStatusProps {
  error: boolean;
  loading: boolean;
  page: number;
  total: number;
  totalPages: number;
  waiting: boolean;
}

export const SearchStatus = ({
  error,
  loading,
  page,
  total,
  totalPages,
  waiting,
}: SearchStatusProps) => {
  let message: string;
  if (waiting) {
    message = "รอค้นหาหลังหยุดพิมพ์…";
  } else if (loading) {
    message = "กำลังค้นหา…";
  } else if (error) {
    message = "ค้นหาไม่สำเร็จ กรุณาลองใหม่";
  } else {
    message = total > 0 ? `พบ ${total} แบบฟอร์ม` : "ไม่พบแบบฟอร์ม";
  }

  return (
    <p
      id="form-search-help"
      className="flex min-h-4 items-center gap-2 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {loading && !waiting ? (
        <Spinner
          role="presentation"
          aria-hidden="true"
          aria-label={undefined}
        />
      ) : null}
      <span>{message}</span>
      {!waiting && !loading && !error && total > 0 ? (
        <span className="sr-only">
          {" "}
          แสดงหน้าที่ {page} จากทั้งหมด {totalPages} หน้า
        </span>
      ) : null}
    </p>
  );
};
