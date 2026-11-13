# ECM login และ token ของ Folio ด้วยบัญชีแยก

Labels: wayfinder:grilling
Type: grilling
Parent: ../map.md
Status: resolved
Assignee: pyw1tt
Blocked by: 01

## Question

เมื่อ Folio ใช้บัญชี ECM เฉพาะของตนเอง จะ login, เก็บและใช้ token, ต่ออายุ และรับมือกับ config/auth ที่ไม่พร้อมอย่างไร โดยไม่พึ่งหรือแก้ Ongoing ไม่ส่ง credentials/Bearer token ไป browser และไม่ส่ง upload/delete ซ้ำโดยไม่ทราบผลเดิม?

บัญชีแยกและการที่ Folio จัดการ login/token เองเป็นคำสั่งที่ผู้ใช้ยืนยันแล้ว ไม่ถามเลือกเจ้าของซ้ำ Username/password จริงจะมีภายหลัง ไม่ขอค่าจริงในแชตและไม่ใช้บัญชี Ongoing เป็น fallback

ต้องกำหนดอย่างน้อย:

- ใช้ ECM_API_URL, ECM_USERNAME, ECM_PASSWORD ฝั่ง server เท่านั้น แยก ECM auth ออกจาก login/session ของ User และจาก file_token ใน JSON คำตอบ
- การ reuse token ตามเวลาหมดอายุที่ตรวจได้ การจัดการคำขอ login พร้อมกัน และหลาย instance ที่ใช้บัญชี Folio เดียวกัน โดยไม่คัดลอก cache ต่อ process/เกณฑ์เหลือ 24 ชั่วโมงของ Ongoing มาโดยอัตโนมัติ
- พฤติกรรมเมื่อ credentials ยังไม่ครบ, login/refresh ไม่สำเร็จ, token ถูกปฏิเสธ หรือ response ไม่ตรงสัญญา ไม่สร้าง token/เวลาหมดอายุปลอมและไม่ทำให้งาน ECM ที่ล้มเหลวกลายเป็น User session หมดอายุ
- การแยกการจัดการ token ออกจากการส่งคำขอเขียนซ้ำ เพื่อให้หัวข้อวงจรไฟล์ร่างกำหนดผลสำเร็จ/ความล้มเหลวและ cleanup ได้อย่างปลอดภัย
- เงื่อนไขก่อนเปิดใช้งาน/ทดสอบจริงเมื่อได้บัญชี Folio รวมสิทธิ์ category/upload/delete และข้อเท็จจริงของ response/expiry ที่ยังไม่ยืนยัน ไม่อ้างว่าได้รับหรือทดสอบบัญชีใหม่แล้ว

## Prerequisites

- [ข้อเท็จจริง ECM: login และความสามารถจัดการไฟล์](01-ecm-api-capabilities.md)

## Notes

เป็นงานวางแผน ไม่สร้าง feature login จริง ไม่เรียก ECM ไม่แก้ข้อมูล/config/credentials ไม่เปลี่ยน Ongoing และไม่เปลี่ยนการ login ของ User ใน Folio ข้อเท็จจริง source ที่อ่านแล้วให้แยกจากพฤติกรรมที่ตั้งใจไว้และสิ่งที่ต้องพิสูจน์เมื่อได้บัญชีจริง

## Comments

### Scope confirmed — 2026-11-13 — คำสั่งผู้ใช้

ผู้ใช้ระบุว่าแต่ละระบบใช้ login ของตนเอง ให้ Folio สร้างการจัดการ ECM login/token ภายในระบบ ไม่ยุ่งกับ Ongoing และจะมี username/password ใหม่ภายหลัง จึงไม่ใช่การใช้บัญชีเดิมร่วมกันแต่แยก cache ไม่ต้องเลือกผู้แจก token ข้าม repo อีก

บัญชีเฉพาะยังเป็นข้อกำหนด/สิ่งที่จะได้รับ ไม่ใช่บัญชีที่ได้รับหรือทดสอบแล้ว ค่าจริงต้องตั้งผ่าน server env/secret store ไม่ส่งในแชต และไม่ใช้การรอบัญชีเป็นเหตุให้สร้าง response/token จำลองในระบบจริง

### Current source evidence — 2026-11-13

- [Prisma schema ของ Folio](../../../packages/db/prisma/schema.prisma) ใช้ PostgreSQL อยู่แล้ว
- [loadPdmsCatalogSession](../../../apps/server/src/pdms/catalog.ts) มี pattern claim งานด้วย conditional update, รอผลแบบจำกัดเวลา และตรวจ load token ก่อนบันทึกผล ใช้เป็นแนวทาง coordination ของ Folio ได้ ไม่ได้หมายความว่ามี ECM token cache อยู่แล้วหรือให้ใช้แถวข้อมูล PDMS ปะปนกัน
- [pdmsProjectsConfigurationFromEnv/loadPdmsProjectNames](../../../apps/server/src/pdms/projects.ts) แยก config ที่ไม่พร้อมเป็นข้อผิดพลาดของ integration มี URL validation, timeout, ไม่ตาม redirect พร้อม service credential และตรวจ response เป็น pattern ที่ควรรักษาเมื่อออกแบบ ECM ไม่ใช่ให้นำ secret/token ของ PDMS มาใช้กับ ECM
- CodeGraph ไม่แสดง exact ECM env symbols จึงค้น `ECM_API_URL|ECM_USERNAME|ECM_PASSWORD` ใน TypeScript ใต้ `apps/server/src` และ `packages` เพิ่ม ไม่พบ match ในขอบเขตนั้น การมีตัวอย่าง env ที่ผู้ใช้เพิ่มไม่ใช่หลักฐานว่า runtime config/auth ของ ECM เสร็จแล้ว
- [ผลวิจัย API](https://github.com/AquilaStudio2/folio-forms/blob/4098cb7/.scratch/ecm-attachments/research/ecm-api.md) ระบุ Login เป็น `POST /api/beeecm/public/login` และผลมี `data.token`/`data.expire`; อายุ 15 วันเป็นข้อความใน docs ไม่ใช่เหตุให้คำนวณ expiry ปลอมเอง ยังไม่มีหลักฐาน timezone/รูปแบบ expire หรือ error semantics จากผล Login จริง

### ข้อเสนอเพื่อให้ผู้ใช้ตัดสินใจ

- ใช้ token ซ้ำตาม expiry ที่ตรวจได้ ไม่ login ใหม่ทุก Save/Submit ไม่คัดลอกเกณฑ์เหลือ 24 ชั่วโมงของ Ongoing ไม่เดา timezone หรือถือว่า response ที่ parse ไม่ได้สำเร็จ
- แนะนำ cache/coordination ฝั่ง server แบบร่วมกันใน PostgreSQL ของ Folio เพื่อรองรับหลาย instance โดยมีผู้ทำ login/refresh หนึ่งงานต่อบัญชีในเวลาหนึ่งช่วง ตรวจรุ่นก่อนแทนที่/ล้าง token เพื่อไม่ให้ผลช้าหรือการปฏิเสธ token เก่าทำรุ่นใหม่หาย Token ที่ persist ต้องปกป้องแบบข้อมูลลับและไม่อยู่ใน API สำหรับ browser/log/JSON คำตอบ/exports
- อีกทางคือ cache ในหน่วยความจำและ single-flight ต่อ process แต่ต้องยอมรับข้อจำกัดหนึ่ง active Folio process ต่อบัญชี รวม worker/replica/ช่วง deploy ที่ทับกัน ไม่อ้างว่ารองรับหลาย instance จาก memory cache
- หากยังไม่มี token ที่ใช้ได้และ login ไม่สำเร็จก่อนเริ่มคำขอไฟล์ แนะนำหยุดเฉพาะงาน ECM แจ้งข้อผิดพลาดและรักษาข้อมูล/ไฟล์ที่เลือก ไม่ทำให้ User หลุดจาก Folio ไม่มี fallback ไป Ongoing และไม่เพิ่ม background queue โดยไม่ได้เลือก
- การลอง login ใหม่กับการส่ง upload/delete ซ้ำเป็นคนละเรื่อง ไม่ส่งคำขอเขียนซ้ำอัตโนมัติเมื่อไม่ทราบผล กรณีล้มเหลวหลังเริ่มคำขอไฟล์และ cleanup เป็นของ [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](05-safe-draft-lifecycle.md)

ยังไม่ทดสอบ login ของบัญชี Folio, response/expiry จริง, สิทธิ์ category/upload/delete หรือการไม่รบกวนบัญชีอื่น ไม่แก้ Ongoing หรือ source/config ของ Folio ไม่มี credentials จริง ไม่มีการเรียก ECM

### Choices — 2026-11-13 — Cache และการลอง auth ใหม่

ผู้ใช้เลือก **ใช้ PostgreSQL ร่วม** สำหรับ token cache/coordination ภายใน Folio และขอ **“ลอง retry สัก 3 รอบ”** แทนการหยุดทันทีเมื่อ login ล้มเหลวก่อนเริ่มคำขอไฟล์

กำลังยืนยันจำนวนสูงสุดให้ชัดว่าเป็น initial attempt แล้ว retry เพิ่ม 3 ครั้ง รวม 4 ครั้ง หรือรวม initial attempt แล้ว 3 ครั้ง ไม่ขยายคำสั่งนี้เป็นการ retry upload/delete หรือ retry รหัสผ่านผิด ต้องมี backoff/deadline รวมและจำกัดเฉพาะความล้มเหลวชั่วคราวที่เหมาะกับการลอง auth ใหม่

### Resolution — 2026-11-13 — ยืนยันร่วมกับผู้ใช้

ผู้ใช้ยืนยันให้ Folio ใช้บัญชี ECM แยกและจัดการ login/token เอง ไม่พึ่งหรือแก้ Ongoing เลือก **PostgreSQL ร่วมภายใน Folio** และยืนยันจำนวน login **สูงสุด 3 ครั้งรวมครั้งแรก** จึงเป็น initial attempt 1 ครั้งกับ retry เพิ่มได้ไม่เกิน 2 ครั้ง ไม่ใช่ retry เพิ่มอีก 3 ครั้ง

#### ขอบเขตและ config

- ใช้ `ECM_API_URL`, `ECM_USERNAME`, `ECM_PASSWORD` ฝั่ง server ของ Folio บัญชีจริงจะมีภายหลัง ไม่ใช้บัญชี/token ของ Ongoing เป็น fallback และไม่เปลี่ยน integration อื่นของ Folio ที่เรียก Ongoing อยู่แล้ว
- Login ใช้ `POST /api/beeecm/public/login` ส่ง JSON `username`/`password` จาก server config แล้วตรวจ response ก่อนใช้ `data.token`/`data.expire`; การต่ออายุในแผนนี้คือ login ใหม่ ไม่สมมติ refresh-token/logout endpoint ที่ไม่มีหลักฐาน งาน ECM ที่ต้องยืนยันตัวตนใช้ Bearer นี้ฝั่ง server เท่านั้น
- นี่คือ service-account login สำหรับ ECM ไม่ใช่การสร้างหรือเปลี่ยนหน้า login/session/role ของ User ใน Folio ไม่เพิ่มหน้า login ECM หรือ public endpoint แจก Bearer token
- ถ้า config ไม่ครบหรือไม่ถูกต้อง ให้เฉพาะงานที่ต้องเรียก ECM ด้วย Bearer ใช้ไม่ได้พร้อมข้อผิดพลาดที่ชัดเจน ไม่สร้าง token/response/expiry ปลอม และไม่ทำให้การใช้ Forms ส่วนอื่นหรือการดูข้อมูลที่บันทึกแล้วต้อง login ECM โดยไม่จำเป็น
- Credentials, ECM Bearer และข้อมูลลับของ cache ต้องไม่ออกไป browser, localStorage, URL, logs, answer JSON หรือ exports `file_token` ของเอกสารยังอยู่ใน JSON ตามสัญญาเดิมและไม่ใช่ Bearer นี้
- ตรวจ URL/path ของบริการตาม config และ docs ไม่ลอง endpoint เดาเอง ไม่ส่ง credentials/Bearer ตาม redirect ไปปลายทางอื่น และต้องปกป้องการส่ง credentials ผ่าน transport ที่เหมาะสมก่อนเปิดใช้จริง

#### Token cache และการ login พร้อมกัน

- ใช้ PostgreSQL ของ Folio เป็น state ร่วมของทุก instance/worker ที่ใช้บัญชีนี้ ไม่ใช้ memory cache ต่อ process เป็นแหล่งความจริงอีกชุด ไม่เพิ่ม Redis, token broker ระหว่างระบบ หรือการเชื่อม DB ของ Ongoing
- แยก state ตามปลายทางและบัญชีที่ตั้งค่าไว้ เก็บ token อย่างป้องกันข้อมูลลับฝั่ง server; token ที่ persist ต้องเข้ารหัสและควบคุมสิทธิ์ backend โดยแยกกุญแจ/secret ออกจากแถว cache ไม่ถือว่าการวางใน DB อย่างเดียวทำให้ปลอดภัยแล้ว
- คำขอพร้อมกันเข้าร่วมงาน login/refresh เดียว ใช้ claim/lease และตรวจ generation/เจ้าของงานก่อนแทนที่หรือล้าง state ไม่ถือ DB transaction ค้างตลอด network login ผลช้าของงานเก่าหรือ 401 จาก token รุ่นเก่าต้องไม่ล้าง/เขียนทับรุ่นใหม่
- Retry budget เป็นของงาน auth ที่แชร์กัน ไม่ใช่แต่ละ waiter ต่างคนต่าง login 3 ครั้ง และไม่ซ้อน retry ใน HTTP client/caller หลายชั้น ทุก waiter รับผลสำเร็จหรือล้มเหลวของงานนั้นภายในเวลาจำกัด ไม่วนเริ่มงานใหม่เองในคำขอเดิม
- Lease และเวลารอรวมต้องสอดคล้องกับ deadline ทั้งชุดรวม retry/backoff/การบันทึกผล ไม่คัดลอกค่า 30/31 วินาทีของ catalog มาโดยไม่ตรวจอายุงาน ไม่ปล่อย claim ทันทีเพียงเพราะ waiter หนึ่งยกเลิก HTTP แล้วให้ waiter อื่นแข่ง login ใหม่
- ใช้ token ซ้ำเมื่อ expiry ที่ตรวจแล้วครอบคลุม timeout ของคำขอ ECM พร้อม clock-skew margin ต่ออายุเมื่อต้องใช้และไม่เหลือช่วงปลอดภัย ไม่ login ใหม่ทุก Save/Submit ไม่ใช้เกณฑ์เหลือ 24 ชั่วโมงของ Ongoing และไม่คำนวณ expiry เองจากข้อความว่าอายุ 15 วัน
- ตรวจ response และ `expire` ก่อนใช้/เก็บ token หากรูปแบบหรือ timezone ไม่ชัดเจน ให้หยุดเป็น bad auth response ไม่ใช้ timezone ของเครื่องโดยเดาและไม่สร้างค่าเริ่มต้นแทน Token หมดอายุหรือถูกเพิกถอนยังเกิดได้ ต้องรับข้อผิดพลาดอย่างปลอดภัย ไม่รับรองว่า cache ทำให้ไม่มี auth error อีก
- บัญชีเดียวกันต้องใช้ coordination ชุดเดียวกัน ห้ามมี instance, worker, environment หรือการ login มือที่ใช้บัญชีนี้อยู่นอกการประสานแล้วอ้างว่าจะไม่ตัด token กัน การทดสอบด้วยบัญชีเดียวกับงานที่เปิดใช้อยู่ต้องผ่านกลไกเดียวกันหรือทำในช่วง/บัญชีทดสอบที่แยกไว้

#### Retry login ที่ผู้ใช้เลือก

- ลอง auth ได้สูงสุด 3 ครั้งรวมครั้งแรก เฉพาะความผิดพลาดชั่วคราวที่เหมาะกับการลองใหม่ เช่น network/timeout, HTTP 408/429 หรือ 5xx ไม่ retry รหัสผ่านผิด, permission denied, config ผิด หรือ response/expiry ที่ไม่ตรงสัญญา
- ค่าออกแบบเริ่มต้นสำหรับงาน auth: timeout ต่อ attempt ไม่เกิน 15 วินาทีและไม่เกินเวลารวมที่เหลือ; deadline รวม 30 วินาที; backoff ก่อน retry ครั้งที่หนึ่ง 1 วินาที และก่อน retry ครั้งที่สอง 2 วินาที ไม่ใช่ผลวัด latency ของ ECM จริง
- เคารพ `Retry-After` ที่ถูกต้องโดยยังอยู่ใน deadline รวม หากเวลารอหรือ attempt ถัดไปไม่อยู่ใน budget ให้หยุด จำนวน 3 เป็นเพดาน ไม่บังคับให้ทำครบเมื่อหมดเวลา/พบข้อผิดพลาดถาวร และไม่เพิ่ม attempt ที่สี่
- จัดการ token ที่ถูก ECM ปฏิเสธด้วยการ invalidate เฉพาะ generation ที่ใช้จริงแล้วส่งข้อผิดพลาดกลับ การเรียกครั้งใหม่ใช้ state ปัจจุบันและขอ token ใหม่ตาม policy นี้ ไม่คัดลอกการส่งคำขอ ECM เดิมซ้ำหลัง 401 ของ Ongoing
- Policy นี้ลองเฉพาะ login/การได้ token ไม่ใช่การ retry category/upload/delete เดิมอัตโนมัติ โดยเฉพาะ upload/delete ที่เริ่มส่งแล้วห้ามตีความว่า login ใหม่ทำให้ส่งซ้ำได้อย่างปลอดภัย

#### ผลต่อผู้ใช้และวงจรไฟล์

- ถ้า auth ไม่สำเร็จก่อนส่งคำขอไฟล์นั้น ต้องไม่เริ่ม upload/delete ครั้งนั้น ส่ง integration error ที่ปลอดภัยและรักษาไฟล์ที่เลือก/ข้อมูลเดิม ไม่ทำให้ User หลุดจาก Folio ไม่ส่ง ECM 401/403 ออกไปเป็นเหตุล้าง Folio session และไม่กลบ 401/403 ที่เป็นสิทธิ์ของ Folio เอง
- ไม่มี background queue/การส่งไฟล์ภายหลังอัตโนมัติจากการเลือก retry login หลังใช้ budget หมด ผู้ใช้ลองใหม่หลังแก้ปัญหาได้ตามสถานะ operation ที่ปลอดภัย ไม่ใช่การส่งไฟล์ซ้ำทั้งที่ผลครั้งเดิมยังไม่แน่ชัด
- การบันทึกที่ไม่ต้องเรียก ECM เช่น reuse ไฟล์และ metadata เดิม ไม่ควรไปขอ token เพียงเพราะเป็น Save/Submit ข้อมูลที่บันทึกแล้วและ public file URLs ยังอ่านตามสิทธิ์/สัญญาเดิมได้โดยไม่ต้องให้ auth ใหม่สำเร็จก่อน
- การยืนยันผลหลังเริ่มส่งคำขอไฟล์, หลายช่องที่สำเร็จไม่พร้อมกัน, การรักษา receipts, การบันทึกเอกสาร/JSON และ cleanup ใช้ [วงจรไฟล์ร่างและการบันทึกโดยไม่สูญหาย](05-safe-draft-lifecycle.md) ไม่รับรองว่าความล้มเหลวของ auth ก่อนไฟล์หนึ่งหมายถึงทั้ง batch ยังไม่มีไฟล์ใดถูกส่ง
- การตั้ง category/รักษาค่าที่บันทึกไว้เมื่อ API ใช้ไม่ได้ยังยึด [ระดับการตั้งค่าปลายทางไฟล์ของ Admin](03-admin-storage-policy.md) ไม่ล้าง category เปลี่ยนบัญชีสำรอง หรือขยายสิทธิ์ของ User เพื่อแก้ auth failure

#### สิ่งที่ต้องมีและตรวจเมื่อได้บัญชีจริง

- เตรียมบัญชีเฉพาะ Folio, config และกุญแจ/การปกป้อง cache ผ่านช่องทาง secret ฝั่ง server ไม่ผ่านแชตหรือข้อมูลคำตอบ
- ยืนยันสิทธิ์ category/upload/delete, success/failure response, รูปแบบ/zone ของ expiry และขอบเขต token ของบัญชีใหม่กับเจ้าของ ECM ก่อนเปิดใช้จริง ไม่ login บัญชี Ongoing เพื่อทดสอบและไม่อ้างว่าบัญชีใหม่ใช้งานได้แล้ว
- ตรวจการประสานหลาย instance, refresh/401 และการกู้คืนจาก timeout กับ implementation จริงในรอบพัฒนา การอ่าน source และการเลือก PostgreSQL ไม่ใช่หลักฐานว่าระบบรองรับกรณีเหล่านี้แล้ว

#### การตรวจแบบจำลองและข้อจำกัด

ตรวจด้วย throwaway deterministic retry-contract model ผ่าน 8 กรณี: สำเร็จ attempt ที่สาม, ไม่ทำ attempt ที่สี่, ไม่ retry credential rejection, ไม่ retry bad response, deadline หยุดก่อนครบสามครั้งได้, `Retry-After` เกิน budget ไม่ถูกข้าม, cache ที่ใช้ได้ไม่ login และ config ไม่พร้อมไม่ใช้ cache เก่า แบบจำลองใช้เวลาสังเคราะห์ ไม่มี network/DB/token/credentials จริง ไม่ใช่การทดสอบ implementation หรือการล็อก PostgreSQL

ปิดการตัดสินใจแผน auth ของ Folio เท่านั้น ยังไม่ได้รับบัญชี ไม่เขียนระบบ login จริง ไม่แก้ source/config/DB schema ไม่แก้ Ongoing และไม่เรียก ECM จริง เรื่องบัญชี/token ร่วมเดิมปิดเป็น out of scope ไม่ใช่ขั้นตอนในสเปกใหม่นี้
