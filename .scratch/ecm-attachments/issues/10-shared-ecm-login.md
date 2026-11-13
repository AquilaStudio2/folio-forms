# การใช้บัญชี ECM ร่วมโดยไม่ตัด token ของระบบอื่น

Labels: wayfinder:grilling
Type: grilling
Parent: ../map.md
Status: resolved
Assignee: pyw1tt
Blocked by: 01, 02

## Question

เมื่อ Folio ต้องใช้บัญชี ECM ร่วมกับระบบอื่น และการ login ใหม่ทำให้ token เก่าใช้ไม่ได้ จะกำหนดผู้ควบคุมการ login และการใช้ token ร่วมกันอย่างไร โดยไม่ให้ Folio หรือระบบเดิมตัด token ของกันและกัน และไม่เปิด credentials/token ให้ browser?

ข้อสรุปต้องระบุผู้เรียก ECM ที่อยู่ในขอบเขต ผู้มีสิทธิ์เริ่ม login ใหม่ วิธีที่แต่ละระบบได้ token ปัจจุบัน และพฤติกรรมเมื่อ token เปลี่ยนระหว่างคำขอหรือผู้ควบคุม token ใช้งานไม่ได้ การมี cache หรือกัน login ซ้ำภายใน process ของ Folio อย่างเดียวไม่ครอบคลุมการ login จากระบบอื่น

ต้องแยกการได้ token ใหม่ออกจากการส่ง upload/delete ซ้ำ เพราะผลของคำขอเขียนที่ล้มเหลวอาจยังไม่แน่นอน ห้ามเลือก retry แบบเหมารวมเพื่อกลบปัญหา token

หากแนวทางต้องปรับ Ongoing หรือบริการอื่น ต้องระบุเจ้าของระบบและข้อตกลงที่จำเป็นก่อน ไม่ถือว่าการวางแผนนี้อนุมัติการแก้ระบบเหล่านั้นแล้ว และไม่เปลี่ยนข้อเท็จจริงว่าผู้ใช้ระบุให้ใช้บัญชีร่วมด้วยการสมมติว่าออกบัญชีแยกได้

## Prerequisites

- [ข้อเท็จจริง ECM: login และความสามารถจัดการไฟล์](01-ecm-api-capabilities.md)
- [โครงสร้าง DCM และการตั้งชื่อไฟล์ที่ Ongoing ใช้จริง](02-dcm-ongoing-flow.md)

## Evidence

ผู้ใช้ยืนยันในคำชี้แจงของ [ยืนยันสัญญา ECM ที่เอกสารยังไม่ตอบ](09-provider-contract-evidence.md) ว่า login ใหม่ทำให้ token เก่าใช้ไม่ได้ และ Folio ต้องใช้บัญชีร่วมกัน หลักฐานสองข้อนี้พร้อมสำหรับการหารือ แม้ ticket ต้นทางยังรอข้อเท็จจริงเรื่องอื่น

## Comments

### Claim — 2026-11-12 — pyw1tt

เริ่มหารือผู้ควบคุมการ login และการใช้บัญชี ECM ร่วมโดยยึดข้อเท็จจริงที่ผู้ใช้ยืนยันว่า login ใหม่ทำให้ token เก่าใช้ไม่ได้ ไม่ขอให้ผู้ใช้ยืนยันข้อนี้ซ้ำ และไม่สมมติว่าแยกบัญชีได้ ขอบเขตเป็นการวางแผนและตรวจ source ไม่เรียก login หรือเปลี่ยน token ของระบบจริง

### Source evidence — 2026-11-12 — ขอบเขตที่ต้องประสาน

- ตรวจ source ปัจจุบันด้วย CodeGraph และอ่านเฉพาะส่วน service ที่ graph ไม่แสดง: [ECMService](../../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts) ใช้ `cachedToken` ระดับ module, `isTokenValid` ใช้เกณฑ์เหลือมากกว่า 24 ชั่วโมง (lines 70–97) และ `getValidToken` เรียก login เมื่อ cache ไม่ผ่านเกณฑ์หรือ force refresh (lines 155–173)
- `loginToECM` อ่าน credentials ฝั่ง server แล้วแทน cache ด้วย token ใหม่ (lines 99–149); `clearTokenCache` ล้าง cache เพื่อให้คำขอถัดไป login ใหม่ (lines 244–250)
- `callECMApi` และ upload เรียกซ้ำพร้อม token ใหม่เมื่อได้ 401 (lines 178–219, 296–325) ไม่ควรนำพฤติกรรมลองคำขอเขียนซ้ำมาเป็นข้อรับรองว่าไม่มีการสร้าง/ลบไฟล์ซ้ำ
- [ECM routes](../../../../pdms-ongoing-backend/src/features/ECM/ecm.route.ts) มี manual login, get token และ clear cache อยู่แล้ว (lines 11–133) การมี route ไม่ใช่หลักฐานว่าออกแบบเป็นช่องทาง server-to-server ที่มีสิทธิ์เหมาะสมหรือพร้อมให้ Folio ใช้โดยตรง
- ภายใต้ข้อเท็จจริงที่ผู้ใช้ยืนยันว่า login ใหม่ทำให้ token เดิมใช้ไม่ได้ การเพิ่ม cache หรือกัน login ซ้ำเฉพาะ Folio ไม่ควบคุมการ login จาก Ongoing หรือ caller อื่น ต้องกำหนดขอบเขตผู้เรียกและผู้ควบคุมร่วมกันก่อนอ้างว่าจะไม่ตัด token ของกันและกัน

หลักฐานนี้เป็นการอ่าน source ไม่ใช่การตรวจ topology/process/สิทธิ์ของ deployment จริง ไม่ได้อ่านค่า credentials ไม่เรียก API และไม่เปลี่ยนโค้ด Ongoing การปรับ flow ข้าม repo ในอนาคตต้องยึด [ขอบเขตสถาปัตยกรรมปัจจุบันและเป้าหมาย](../../../../pdms-ongoing-backend/docs/architecture/README.md) และข้อตกลงเจ้าของระบบ

### Discussion — 2026-11-12 — ขอบเขตการประสาน

ผู้ใช้ยืนยันว่าแผนรวมการประสานปรับ Ongoing และระบบอื่นทุกตัวที่ใช้บัญชี ECM นี้ร่วมกันได้ ไม่จำกัดให้แก้เฉพาะ Folio ข้อนี้อนุญาตให้เลือกแนวทางร่วมในแผน ไม่ใช่หลักฐานว่าระบบอื่นเปลี่ยนแล้วหรืออนุมัติให้แก้โค้ดตอนนี้

กำลังเลือกขอบเขตจุดกลางระหว่างผู้ควบคุมทั้ง login และคำขอ ECM กับผู้ควบคุม login ที่ส่ง token ให้แต่ละ backend ไปเรียก ECM เอง ต้องระบุผลต่อขอบเขต credentials และ failure behavior หลังได้ข้อสรุปนี้

### Discussion — 2026-11-12 — Folio เรียก ECM โดยตรง

หลังขอคำอธิบาย ผู้ใช้เลือกให้ Folio เรียก ECM โดยตรง และขอคำแนะนำสำหรับนำมาปรับใช้ ไม่ได้เลือกให้คำขอ category/upload/delete ของ Folio วิ่งผ่าน Ongoing

ข้อเสนอที่นำมาหารือคือใช้ module ECM เดิมของ Ongoing เป็นเจ้าของ login/token ร่วมเท่านั้น Folio backend ขอ token ผ่านช่องทาง server-to-server ที่ตรวจสิทธิ์แล้วนำไปเรียก ECM เอง ต้องปรับผู้ใช้บัญชีร่วมให้เลิก login อิสระ และจัดการ token state/การ login ซ้อนกันที่จุดกลาง ไม่ใช่ให้ Folio ใช้ endpoint แจก token เดิมโดยไม่ตรวจสิทธิ์

ข้อเสนอนี้ยังไม่ใช่ resolution ต้องยืนยันเจ้าของ token พฤติกรรมระหว่างเปลี่ยน token/จุดกลางใช้ไม่ได้ และขอบเขต caller ของบัญชีร่วมก่อนปิดงาน ไม่เปลี่ยนตัวแปร environment หรือโค้ดสอง repo ในรอบวางแผนนี้

### Scope correction — 2026-11-12 — Folio มี login/cache ของตนเอง

ผู้ใช้ชี้แจงให้ Folio แยกระบบ login/token ออกจาก Ongoing โดยสมบูรณ์ในระดับ application และใช้ Ongoing เป็นตัวอย่างวิธีเชื่อมต่อเท่านั้น มีผู้ใช้บัญชีร่วมสองระบบคือ Folio และ Ongoing ข้อนี้แทนข้อเสนอใช้ Ongoing เป็นเจ้าของ login/token และความเข้าใจเดิมว่าจะปรับ Ongoing ร่วมกัน ห้ามแก้หรือเพิ่ม dependency ไป Ongoing เพื่อให้ Folio ทำงาน

ข้อจำกัด ECM ยังคงตามคำตอบผู้ใช้: login ใหม่ของบัญชีนี้ทำให้ token เก่าใช้ไม่ได้ การแยก cache ไม่แยกขอบเขต token ของผู้ให้บริการ จึงห้ามอ้างว่า cache ใน Folio ป้องกันการถูก Ongoing ยกเลิก token ได้ การใช้งานทั้งสองระบบพร้อมกันอาจเกิดการ login สลับแล้วทำให้ token ของกันและกันใช้ไม่ได้ซ้ำ

#### หลักฐานใน Folio สำหรับแนวทางที่เสนอ

- [schema.prisma](../../../packages/db/prisma/schema.prisma) lines 5–8 ใช้ PostgreSQL อยู่แล้ว ไม่จำเป็นต้องตั้ง Redis หรือระบบแจก token ใหม่เพื่อมี cache ร่วมภายใน Folio
- [loadPdmsCatalogSession](../../../apps/server/src/pdms/catalog.ts) lines 62–133 ใช้สถานะใน DB, `loadToken`/`loadExpiresAt`, conditional claim และตรวจเจ้าของก่อนเขียนผล เป็น pattern ประกอบการออกแบบ refresh ที่หลายคำขอรอผลร่วมกัน ไม่ใช่ข้อพิสูจน์ว่า token ECM ถูก cache แล้วหรือให้คัดลอก lease/retry โดยไม่พิจารณา side effect ของ login
- compose ประกาศ `server` และ `postgres`; การอ่านไฟล์ไม่ยืนยันจำนวน instance ของ deployment จริง

กำลังเสนอการ cache token/expiry ฝั่ง server ของ Folio, ลดการ login ซ้ำและป้องกัน refresh ซ้อนภายใน Folio, ตรวจรุ่น token ที่ถูกปฏิเสธก่อนล้าง cache และจำกัดการกู้คืน ไม่ใช้วิธีวน login หรือส่ง upload/delete ซ้ำโดยไม่รู้ผล ข้อเสนอยังต้องยืนยันวิธี cache และระดับผลกระทบที่ยอมรับได้ภายใต้บัญชีร่วม

### Scope revision — 2026-11-12 — ใช้ ECM login ของ Ongoing ร่วมกัน

ผู้ใช้แก้ไขความต้องการล่าสุดให้ Folio ใช้ ECM login/token ของ Ongoing ร่วมกันเพื่อไม่ให้แข่ง login ข้อนี้แทน Scope correction ที่ให้ Folio login/cache แยกเอง และแทนข้อเสนอ cache token ใน PostgreSQL ของ Folio ซึ่งไม่ได้รับการเลือก

- ร่วมกันเฉพาะการจัดการ ECM login/token ไม่เปลี่ยนการ login ของ User ใน Folio
- Folio backend ยังเรียก API category/upload/delete ของ ECM โดยตรง ไม่ส่งไฟล์อัปโหลดผ่าน Ongoing
- ขอบเขตผู้ใช้บัญชีร่วมที่ผู้ใช้ยืนยันมีสองระบบ คือ Ongoing และ Folio ไม่เพิ่มระบบแจก token ที่ deploy แยกใหม่
- ต้องปรับจุดขอ token ให้ตรวจสิทธิ์เฉพาะ server-to-server และให้การ login/refresh ของ Ongoing ทุกเส้นทางผ่านผู้ควบคุมเดียวกัน รวมกรณีหลาย instance ไม่ใช้ cache แยกต่อ process แล้วอ้างว่าเป็น token กลาง
- Folio ไม่ login เองแม้ได้รับ 401 หรือ Ongoing ติดต่อไม่ได้ การขอ token ใหม่ต้องผ่านจุดกลาง ไม่ส่ง ECM token หรือ credentials ไป browser และไม่ตีความปัญหา ECM เป็นการหมดอายุ session ของ User ใน Folio

ยังต้องยืนยันพฤติกรรมเมื่อขอ token ไม่ได้ และความปลอดภัยของการลองคำขอเขียนซ้ำระหว่างเปลี่ยน token ก่อนปิดหัวข้อนี้ ไม่ถือว่าได้แก้หรือทดสอบ Ongoing แล้ว

### Deferred — 2026-11-12 — รอผลปรึกษาทีม

ผู้ใช้ขอพักการเลือกว่าจะใช้ ECM login/token ของ Ongoing ร่วมกัน หรือให้ Folio จัดการเอง เพื่อปรึกษาทีมก่อน จึงยังไม่มีแนวทางที่ได้รับการอนุมัติให้ยึดเป็นข้อสรุป

บันทึก Scope revision และข้อเสนอในบทสนทนาก่อนหน้านี้เป็นประวัติการหารือ ไม่ใช่ resolution ที่ล็อกให้ใช้ Ongoing และไม่ใช่การเลือก cache ใน Folio แทน ห้ามนำข้อเสนอใดไปเริ่มแก้โค้ด ตั้งค่า credentials หรือเปลี่ยน API ข้าม repo ระหว่างรอ

คง `Status: claimed` และผู้รับผิดชอบเดิมเพื่อไม่ให้ session อื่นหยิบมาปิดแทนผู้ใช้ งานยังไม่ resolved ไม่เพิ่มรายการใน Decisions so far และไม่ปลด dependencies ของงานวงจรไฟล์

เมื่อมีผลจากทีม ให้กลับมาตัดสินผู้รับผิดชอบ login ขอบเขตที่ปรับได้ และกติกาเมื่อ token เปลี่ยน/ติดต่อระบบไม่ได้ก่อนบันทึก resolution ข้อสรุปเรื่องปลายทาง ชื่อไฟล์ และเกณฑ์รับไฟล์ที่ปิดไปแล้วไม่เปลี่ยนตามการพักหัวข้อนี้

### Resume — 2026-11-13 — กลับมาหารือเรื่อง login ก่อน

ผู้ใช้ขอ “ยกเรื่อง login ที่ค้างไว้มาคุยกันได้ก่อน” จึงกลับมาหารือหัวข้อนี้ โดยยังไม่ถือว่าทีมเลือกใช้ Ongoing หรือ Folio และไม่ถือว่าข้อเสนอใน Scope revision เดิมได้รับการอนุมัติแล้ว

คง `Status: claimed` และผู้รับผิดชอบเดิม วงจรไฟล์ยังมี dependency มาที่หัวข้อนี้ตามเดิม ไม่มีการอนุมัติให้ปรับ dependency จากคำถามเลือกเส้นทางที่ถูกขัดจังหวะ ขอบเขตยังเป็นการเลือกนโยบาย ECM login ฝั่ง server ไม่ใช่การเปลี่ยน login/session ของ User ใน Folio ไม่เรียก login จริง ไม่แก้ credentials หรือ source ข้าม repo

### Current evidence — 2026-11-13 — ก่อนเลือกผู้ควบคุม login

- ค้น curated Knowledge กลางด้วย `ECM login getValidToken cachedToken Ongoing Folio shared account token` และค้นกว้างขึ้นด้วย `ECM` ไม่พบหน้าความรู้ทั้งสองครั้ง ไม่ถือว่าผลค้นว่างเป็นหลักฐานยืนยัน business logic ใช้ source ปัจจุบันและข้อเท็จจริงที่ผู้ใช้ยืนยันประกอบการหารือ
- ตรวจ [ECMService](../../../../pdms-ongoing-backend/src/features/ECM/ecm.service.ts) ปัจจุบัน: token อยู่ใน `cachedToken` ระดับ module; `getValidToken` เรียก `loginToECM` เมื่อ cache ไม่ผ่านเกณฑ์หรือ force refresh กลไกที่เห็นยังไม่ใช่การประสาน token ข้ามระบบ/หลาย process
- รันเฉพาะ initializer ของ `isTokenValid` จาก source จริงใน VM โดยใช้เวลาสังเคราะห์: ไม่มี cache, เหลือ 1 ชั่วโมง และเหลือครบ 24 ชั่วโมงได้ false; เหลือ 24 ชั่วโมงกับอีก 1 ms ได้ true นี่คือเกณฑ์ local reuse ไม่ใช่การทดสอบว่า token ยังได้รับการยอมรับจาก ECM ไม่ได้เริ่ม application module, อ่านค่า env จริง, ต่อ DB หรือเรียก network
- [ECM routes](../../../../pdms-ongoing-backend/src/features/ECM/ecm.route.ts) ยังมี manual login และ clear cache ส่วน service มีการส่งคำขอซ้ำหนึ่งครั้งเมื่อได้ 401 ทั้ง generic calls และ upload ห้ามนำ route/cache/retry เดิมมาใช้แล้วอ้างว่ารองรับบัญชีร่วมอย่างปลอดภัยแล้ว
- flow ที่ตรวจใน [uploadFilesToECM ของ FE ON](../../../../pdms-ongoing-project-management/app/services/uploadFile-ecm.service.ts) ส่งไฟล์ไป BE ON ที่ `/api/ecm/file/upload` ไม่ใช่หลักฐานว่า Folio ต้องส่งไฟล์ผ่าน Ongoing ด้วย และไม่ได้พิสูจน์ผู้เรียก endpoint token ทุกแห่ง
- อ่านเอกสาร architecture ของ BE ON/FE ON แล้ว ส่วนเป้าหมายยังเป็นแผน ไม่ใช่ deployment ปัจจุบัน หากเปลี่ยนสัญญาข้าม repo จริงต้องประสานผู้ให้/ผู้เรียกและอัปเดตภาพรวมตามกติกา repo ไม่ใช้ `X_ONGOING_SECRET` ร่วมเดิมเป็นหลักฐานว่าได้ออกแบบสิทธิ์สำหรับ Folio แล้ว

### ตัวเลือกที่นำมาหารือ — ยังไม่ใช่ข้อสรุป

- ให้ Ongoing เป็นผู้ควบคุม ECM login/refresh เพียงจุดเดียวเชิงตรรกะ แล้ว Folio backend ขอเฉพาะ token ผ่านสัญญา server-to-server ที่มีสิทธิ์เฉพาะ งาน category/upload/delete ของ Folio ยังเรียก ECM โดยตรง ไม่เป็น file gateway ผ่าน Ongoing
- หรือให้ Folio เป็นผู้ควบคุมเพียงจุดเดียว แล้วปรับ Ongoing ทุกทางที่เคย login/refresh ให้ขอ token จาก Folioแทน ไม่ใช่ให้ทั้งสองระบบ login บัญชีเดียวกันอย่างอิสระ
- ต้องครอบคลุม manual login, cache clear, การตอบสนองต่อ 401 และหลาย instance ไม่ใช่เพียงมี cache แยกในแต่ละระบบ ไม่รับรอง runtime topology หรือว่า endpoint ปัจจุบันพร้อมใช้เป็น token broker แล้ว

คำว่า token ในหัวข้อนี้หมายถึง ECM Bearer สำหรับเรียก API ไม่ใช่ `file_token` ที่เก็บใน JSON คำตอบ และไม่ใช่ session token ของ User ยังรอผู้ใช้เลือกผู้ควบคุมและยืนยันขอบเขตการประสานทีม

### Out of scope — 2026-11-13 — ผู้ใช้เลือกบัญชี ECM แยกของ Folio

ผู้ใช้ยืนยันให้แต่ละระบบใช้ login ของตนเอง โดย Folio ต้องจัดการ login/token ภายในระบบเอง ไม่ยุ่งกับ Ongoing และจะมี username/password ใหม่ให้ภายหลัง คำสั่งนี้แทนสมมติฐานเดิมที่ Folio ต้องใช้บัญชีร่วมและข้อเสนอ token broker ทุกแบบในประวัติข้างต้น ไม่ได้หมายถึงใช้บัญชีเดิมร่วมกันแต่แยก cache

ปิดหัวข้อการประสานบัญชี/token ร่วมเป็นงานนอกขอบเขต ไม่ใช่ resolution ว่าเลือก Ongoing หรือ Folio เป็นผู้แจก token ให้ทั้งสองระบบ และไม่เพิ่มหัวข้อนี้ใน Decisions so far ของ map

งาน auth ที่ยังจำเป็นอยู่ใน [ECM login และ token ของ Folio ด้วยบัญชีแยก](13-folio-ecm-auth.md) ซึ่งเป็นเจ้าของการใช้ env ฝั่ง server, cache/expiry/concurrency และเงื่อนไขก่อนทดสอบด้วยบัญชีจริง วงจรไฟล์เปลี่ยน dependency ไปหัวข้อนั้น ไม่ถือว่าการปิดงานใช้บัญชีร่วมทำให้ auth พร้อมใช้งานแล้ว

ยังไม่ได้รับหรือทดสอบบัญชีใหม่ ไม่แก้ Ongoing ไม่แก้ source/config/credentials และไม่เรียก ECM จริง
