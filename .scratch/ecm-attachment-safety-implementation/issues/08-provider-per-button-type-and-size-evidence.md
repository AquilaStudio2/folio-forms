# 08: หลักฐาน DCM สำหรับชนิดและขนาดต่อปุ่ม

**What to build:** ตรวจรับการรับส่ง receipt และการเข้าถึงไฟล์ของแต่ละปุ่ม/slot ตามชนิดและขนาดที่ตกลง โดยแยกเส้นทาง initial upload, reopen/access และ number-change saved-reference reuse ไม่เพิ่มการเทียบ bytes หรือ aggregate-capacity workload ที่ผู้ใช้ตัดแล้ว

**Blocked by:** 01 — ส่งชื่อเดิมได้ พร้อม receipt และคำเตือนถูกประเภท.

**Status:** ready-for-agent

**Spec coverage:** ECM Attachment Safety implementation spec — US85–88, US90; Testing Decisions C.3–C.5

**Execution prerequisites:** ต้องมีคำสั่งเริ่มงานหลังตรวจตั๋ว และ real-provider execution scope ของ account/environment/approved base/synthetic writes/stop conditions/cleanup owner ที่ชัดเจน DELETE ต้องได้รับอนุญาตแยก ไม่เกิดจากตั๋วนี้

## Acceptance criteria

- [ ] ใช้ revised upload/receipt behavior และ isolated proof จาก 01 ก่อน scoped provider trials ไม่พึ่ง full-browser acceptance ของ 06 และไม่ขอเลือก file types/product limits เดิมซ้ำ
- [ ] Matrix ระบุแต่ละปุ่ม/slot ของตน ทั้ง scalar/table ที่อยู่ใน scope ไม่สรุปรวมว่าทุกปุ่มผ่านจากผลของปุ่มเดียวหรือขนาดรวมต่อ batch
- [ ] Representative families คง PDF, DOCX, XLSX, image, text, HTML original, benign binary/ZIP, password-protected และ extensionless/case-preserved extensions แยกจาก size-boundary dimension ไม่เปลี่ยนเป็น allowlist หรืออ้างว่าทุก format/combination ผ่าน
- [ ] แต่ละ applicable slot/path มีผล initial upload, reopen/access และเปลี่ยน docs_number ผ่าน trusted saved reference ตาม workflow เดิม ไม่บังคับเลือก File ใหม่หรือใช้ preview เพื่อกลบ retrieval failure
- [ ] ตรวจ actual File size ต่อปุ่มที่ 0 และ 10,000,000 bytes แบบ inclusive ส่วน 10,000,001 ต้อง Folio reject ก่อน provider dispatch โดยตรวจ no-dispatch ในระบบแยก ไม่ส่ง oversize ไป live DCM จากแผนนี้
- [ ] คงหนึ่งไฟล์ต่อ slot, zero-byte acceptance/requiredness และ active/empty-row rules ไม่ขอ password/ถอดรหัส/รับรองความปลอดภัยหรือความถูกต้องของเนื้อหา
- [ ] เกณฑ์ type/size เก็บ API outcome, validated original paired receipt และ URL access result ผูกกับ slot/round/path ไม่ adopt search result จากชื่อหรือรับ malformed schema เพื่อให้ผ่าน
- [ ] ไม่บังคับ upload-versus-download exact bytes/SHA-256 comparison ใน matrix นี้ ไม่รัน 1/10/20 full-size-file workload, aggregate bytes, two-Response concurrency หรือ workload เพื่อรับรอง aggregate capacity และไม่เก็บ workload ที่ตัดแล้วเป็น planning/release gate ใหม่
- [ ] ไม่เพิ่ม batch cap/config หรืออ้าง unlimited capacity ผลรับส่ง/receipt/access ไม่ใช่ proof ว่าไฟล์อ่านคืนตรงต้นฉบับ ไม่เสียหาย หรือปลอดภัย
- [ ] Runtime original-reuse size/hash/origin/no-redirect, streamed actual-byte/trusted-slot/JSON 262,144-byte validation และ security/reference/concurrency guards เดิมยังทำงาน ถ้า check ปฏิเสธให้รายงานผลตามจริง ไม่ถอด check เพื่อให้ matrix ผ่าน
- [ ] Real API จำกัดฐาน กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45) เท่านั้น ถ้า number-change/literal-template scenario ต้องออกนอก scope ให้ตรวจ local path และคง real-provider cell pending จนมี authorization ที่เพียงพอ ไม่ใช้เลข/แม่แบบสำรอง
- [ ] ตรวจ authorized ownership/collision boundary ก่อน synthetic write ไม่ถือ search ว่างอย่างเดียวเป็น safe-write proof หยุดเมื่อ unexpected error/unknown ไม่ auto POST/DELETE retry ไม่เปลี่ยนชื่อเพื่อให้ส่งได้ และไม่ cleanup known files โดยเดา
- [ ] ส่ง sanitized matrix ราย type/button/path/size พร้อม actual source/environment/date/version เท่าที่ทราบ, outcome/access/receipt correlation, evidence status และ pyw1tt review ไม่เก็บ raw tokens/credentials/private URLs/original copies ลง repo
- [ ] Unrun/unsupported/unverified cases ระบุ pending/partial/insufficient และ applicable HOLD ตามจริง ไม่ถือ approval ของแผนหรือ PDF sample เดิมเป็น matrix PASS ข้อยกเว้นในตั๋วนี้ไม่ยกเลิก evidence plan ของ identity/history/recovery tickets อื่น

## Scope boundaries

ตั๋วนี้รับขอบเขตที่ผู้ใช้ลดแล้วตามเดิม ไม่มี byte-comparison หรือ aggregate-capacity requirement ใหม่ Runtime checks ที่มีอยู่เป็น production behavior ที่ต้องคง ไม่ใช่เกณฑ์ evidence ที่ถูกตัด

DELETE isolation อยู่ใน 07; original-request finality อยู่ใน 09 ไม่ใช้ผล type/size มารับรองสองเรื่องนั้น

## Comments

2026-11-18: ผู้ใช้อนุมัติ breakdown/edge 01 และขอบเขตต่อปุ่มแล้ว เผยแพร่เพื่อให้ตรวจตั๋วก่อน execution ไม่มี live-provider matrix result ใหม่จากการสร้างตั๋ว
