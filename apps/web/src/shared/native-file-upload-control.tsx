import { AlertCircle } from "lucide-react";
import { useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface NativeFileUploadControlProps {
  fieldId: string;
  required: boolean;
  disabled: boolean;
  onFileChange: (file: File | null) => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const NativeFileUploadControl = ({
  fieldId,
  required,
  disabled,
  onFileChange,
}: NativeFileUploadControlProps) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("รองรับเฉพาะไฟล์ขนาดไม่เกิน 50 MB");
      event.target.value = "";
      return;
    }
    setError(null);
    setFileName(file.name);
    onFileChange(file);
  };

  return (
    <div className="grid grid-cols-1 gap-4 my-2">
      <div className="flex items-center justify-center w-full max-w-xl">
        <label
          htmlFor={fieldId}
          className={`flex flex-col items-center justify-center
            w-full min-h-36 border-2 border-gray-300
            border-dashed rounded-lg cursor-pointer
            bg-gray-50 hover:bg-gray-100
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          {fileName ? (
            <div className="p-10 text-center">{fileName}</div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6">
              <span className="text-blue-600">เพิ่มไฟล์</span>
            </div>
          )}

          <input
            ref={inputRef}
            id={fieldId}
            type="file"
            className="sr-only"
            required={required}
            disabled={disabled}
            onChange={handleFileChange}
          />
        </label>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4 " />
          <AlertTitle>อัปโหลดไฟล์ไม่สำเร็จ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-gray-500">(รองรับไฟล์ขนาดไม่เกิน 50 MB เท่านั้น)</p>
    </div>
  );
};
