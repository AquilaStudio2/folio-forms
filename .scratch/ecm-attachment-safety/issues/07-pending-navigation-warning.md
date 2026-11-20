# คำเตือน refresh และ navigation สำหรับ pending Files ใน memory

Labels: wayfinder:grilling Type: grilling Parent: ../map.md Assignee: pyw1tt Status: resolved

## Question

ภายใต้โมเดลที่ยอมรับแล้วว่า pending File อยู่ใน browser memory เท่านั้น ต้องเตือนและขอยืนยันการทิ้งงานในจังหวะใด เพื่อไม่ให้ User เข้าใจว่า file selection ถูกบันทึกหรือกู้คืนหลัง reload ได้?

เป็น HITL decision เรื่องขอบเขตคำเตือนและ discard ไม่ใช่เปิดคำถาม temporary storage, auto-upload หรือ persistence ใหม่

Provider settlement อยู่ที่ [หลักฐานยุติ unknown upload และ DELETE ที่เชื่อถือได้](06-unknown-settlement-contract.md) คำเตือน navigation ต้องเคารพ HOLD ที่มีอยู่ แต่กำหนดข้อความ memory-loss ได้ก่อน จึงไม่บล็อกกัน

## ข้อเท็จจริงและข้อจำกัด

- [รายงานตาราง: เลือกไฟล์และสถานะที่ยังไม่บันทึก](../../ecm-storage-templates/table-upload-behavior-audit.md#c-เลือกไฟล์และสถานะที่ยังไม่บันทึก) แยก candidate ใน dialog, confirmed host pending และ canonical saved receipt; checkpoint ไม่ได้เก็บ bytes
- [CONTEXT: Attachment Field](../../../CONTEXT.md#attachment-field) กำหนด Cancel/X ของ dialog รักษา baseline; final Correction completion ไม่ล้างการเลือกใหม่ที่ไม่ได้อยู่ใน captured snapshot และไม่สัญญาว่า browser Files อยู่ข้าม reload
- Saved Draft ที่เปิดใหม่อ่าน saved receipts ได้ ไม่ใช่การกู้ unsaved File จาก memory การกู้ original Operation ไม่เท่ากับยอมรับ ordinary answers/selection ที่เพิ่งเลือกใหม่

## ประเด็นสำหรับรอบ grilling

1. Browser refresh/close, internal navigation, route switch และหลาย tabs ต้องเตือนช่วงใดสำหรับ candidate, confirmed pending replacement, pending removal และ native unsaved inputs? Browser อาจจำกัดหรือไม่แสดง beforeunload prompt ต้องระบุ best-effort ตามจริง
2. คำยืนยัน discard ต้องบอกว่าสูญเสียเฉพาะงานใดและรักษา saved canonical state ใด? อย่าบอกว่ากู้ File ได้จาก filename/checkpoint หรือว่า Cancel navigation ยกเลิก external request ที่ส่งแล้ว
3. Save กำลังทำ/unknown checkpoint กับ completed save ที่ยังมี newer pending จะออกจากหน้าได้เมื่อใด? คงคำแนะนำ unknown-outcome และ no-resend ไม่แทนด้วย “ลองส่งใหม่”
4. Final Correction ที่ operation เสร็จแล้วแต่มี pending ใหม่ต้องยืนยัน discard-and-exit อย่างไร? ไม่เปิดอีก Save บน retired workspace หรือย้าย File เข้า Correction ใหม่เอง
5. ข้อความสั้นใดแยก “เลือกแล้ว”, “ยืนยันในกล่องแล้ว”, “บันทึกจริงแล้ว” และ “ไฟล์ใหม่ยังไม่บันทึก” โดยไม่เพิ่ม upload stage/UI ที่ไม่จำเป็น?

## Evidence ที่ต้องมี

- [x] Human ยืนยัน trigger matrix และข้อความ รวมข้อจำกัด browser prompt และเส้นทางที่เตือนอย่างรับประกันไม่ได้
- [ ] ใช้ existing UI/native seam เฉพาะ navigation/browser behavior; HTTP ใช้ตรวจว่า canceled navigation/unchanged save ไม่ทำ external writes หรือแก้ canonical receipt
- [ ] ทดสอบ saved state เทียบ pending ก่อน/หลัง confirm/cancel/reload ใน actual supported browser โดยไม่อ้างการกู้ bytes ที่ไม่มี
- [ ] ไม่มี sessionStorage/IndexedDB/server temporary copy หรือ auto-upload เพิ่มเพื่อเลี่ยงโมเดล memory-only

## Comments

2026-11-18: ยังไม่อนุมัติ trigger/message matrix ใหม่ ไม่มี browser trial หรือการเปลี่ยน persistence ใน charting session นี้

### Discussion — pyw1tt — ขอบเขตเตือนและชื่อสถานะ รอ human

- Claim เพื่อคุย decision เท่านั้น อ่าน canonical Attachment Field และรายงานส่วน C แล้ว ไม่มี browser/source-runtime verification ใหม่ ไม่แก้ application หรือโมเดล memory-only
- **Q1 proposed — ก่อนเริ่ม Save:** เมื่อมี candidate ในกล่อง, confirmed pending File/replacement/removal หรือ ordinary unsaved form edits ให้เตือนก่อน internal navigation/route change ที่จะทิ้งงาน และขอ browser beforeunload prompt สำหรับ refresh/close ตามข้อจำกัด browser ไม่รับรองว่าจะแสดงทุกครั้ง ไม่มีงานใหม่ค้างไม่เตือน การเปิดอีกแท็บที่ไม่ทำลายหน้าเดิมไม่ใช่เหตุทิ้งงานหรือย้าย pending File ไปอีกแท็บ
- **Q2 proposed — ชื่อสถานะ:** แยก “เลือกในกล่อง — ยังไม่บันทึก”, “ยืนยันไฟล์แล้ว — รอบันทึกแบบฟอร์ม” และ “บันทึกแล้ว” ซึ่งใช้เมื่อ explicit Save Draft/Submit/final Save Correction canonical commit สำเร็จ ไม่เรียก dialog Save ว่า upload/save สำเร็จ และเมื่อมี saved A กับ pending B ต้องไม่ทำให้ดูเหมือน B บันทึกแล้ว
- **Existing boundaries ไม่เปิดใหม่:** Cancel/X ของ picker ทิ้งเฉพาะ local changes ตั้งแต่เปิดกล่อง ไม่ล้าง previous confirmed pending/canonical saved selection; ไม่เพิ่ม auto-upload/storage หรือสัญญากู้ browser File หลัง reload
- รอคำตอบ Q1/Q2 ก่อนกำหนดรายละเอียด discard confirmation และ variants ระหว่าง Save/unknown/final Correction ที่มี newer pending ไม่ถือข้อเสนอเป็นอนุมัติ ไม่ปิดตั๋วหรือเริ่ม browser/API trials

### Human decision — pyw1tt — อนุมัติ Q1 ช่วงเตือนและ Q2 ชื่อสถานะ

- ผู้ใช้ตอบ “ทำตามแนะนำทั้งหมด” ต่อ Q1/Q2 ของตั๋วนี้ อนุมัติ intended warning triggers และข้อความสถานะ ไม่ใช่คำสั่งเริ่ม implementation/browser trial และยังไม่ใช่คำตอบของ variants ที่ระบุว่าจะคุยต่อ
- **Q1 approved:** ก่อนเริ่ม Save ให้เตือนเมื่อมี candidate ในกล่อง, confirmed pending File/replacement/removal หรือ ordinary unsaved form edits ก่อน internal navigation/route change/back ที่จะทิ้งงาน ขอ browser prompt สำหรับ refresh/close แบบ best-effort ไม่รับประกันทุกครั้ง ไม่มีงานค้างไม่เตือน การเปิดอีกแท็บโดยไม่ทำลายหน้าเดิมไม่เตือนและไม่ย้าย File ข้ามแท็บ
- **Q2 approved:** ใช้สถานะ “เลือกในกล่อง — ยังไม่บันทึก”, “ยืนยันไฟล์แล้ว — รอบันทึกแบบฟอร์ม” และ “บันทึกแล้ว” โดยสถานะสุดท้ายต้องอาศัย explicit Save Draft/Submit/final Save Correction canonical commit สำเร็จ ไม่ใช้ dialog confirmation แทนผลอัปโหลดหรือผลบันทึก เมื่อมี saved A/pending B ต้องแยกสองสถานะได้
- Picker Cancel/X ยังคง local baseline semantics เดิม ไม่ถูกเปลี่ยนเป็นการทิ้งทุก pending ของหน้าหรือ DELETE ไฟล์ที่บันทึกแล้ว ขอบเขต memory-only/public links/unknown safeguards คงเดิม ไม่มี auto-upload/persistence ใหม่

### Discussion — pyw1tt — Q3/Q4/Q5 การออกจากหน้า รอ human

- **Q3 proposed — ยังไม่เริ่ม Save:** ใช้ existing platform modal สำหรับ app-controlled navigation แจ้งว่าจะทิ้งเฉพาะ unsaved selections/removals/form edits ไม่ลบ saved canonical answer ปุ่ม “อยู่หน้านี้ต่อ” เป็นทางปลอดภัย และ “ทิ้งการเปลี่ยนแปลงและออก” เป็น explicit discard; Cancel/Escape ไม่ทิ้งงาน ไม่มี Save-and-exit/POST/DELETE อัตโนมัติ ข้อความกำหนดเองนี้ไม่ใช่การรับรอง browser-native prompt
- **Q4 proposed — Save กำลังทำ/ผล unknown:** แนะนำให้อยู่รอหรือตรวจ original Operation ก่อน หากยืนยันออก ให้แจ้งว่าการออกจากหน้าไม่ใช่การยกเลิก original request ซึ่งอาจสำเร็จภายหลัง และ unsaved local/newer Files อาจหาย ใช้คำว่า “ออกจากหน้า” ไม่ใช่คำรับรองว่า “ยกเลิกการส่งสำเร็จ” Navigation ไม่ clear checkpoint/HOLD หรือสั่ง resend/DELETE/fence โดยอัตโนมัติ การกลับมาต้องตรวจ original Operation ตามสิทธิ์ ไม่เริ่ม upload ใหม่เพียงเพราะเปิดหน้าใหม่
- **Q5 proposed — final Correction เสร็จแต่มี newer pending:** คง editor และแจ้งแยก “รอบแก้ไขเดิมบันทึกแล้ว” กับ “การเปลี่ยนใหม่ยังไม่บันทึก” ไม่ Save ซ้ำบน retired workspace หรือย้าย File ไป Correction ใหม่เอง ใช้ explicit discard-and-exit หากต้องทำต่อให้เปิด current revision เป็น Correction ใหม่และเลือก File อีกครั้ง ไม่สัญญากู้ bytes หลัง reload
- ทั้งสามข้อยังเป็นข้อเสนอ รอ human ยืนยันก่อนบันทึก Resolution/ปิดตั๋ว ไม่เปิดคำถามการกู้ operation, settlement proof หรือ retired-workspace policy ที่ canonical owner ตัดสินแล้วใหม่

### Human decision — pyw1tt — Q3 approved และ Q4 loading requirement

- **Q3 approved:** ผู้ใช้ตอบ “q3:ตามแนะนำ” ยืนยัน app-controlled discard modal ก่อนเริ่ม Save ใช้ “อยู่หน้านี้ต่อ” กับ “ทิ้งการเปลี่ยนแปลงและออก” ทิ้งเฉพาะ unsaved local changes ไม่ลบ saved canonical answer ไม่ upload/save/DELETE อัตโนมัติ และไม่เปลี่ยน picker Cancel/X baseline หรือข้อจำกัด browser prompt
- **Q4 human requirement:** ผู้ใช้เสนอ “น่าจะต้องทำloadingเอาไว้ไม่ให้กดอะไรได้จนกว่าจะทำเสร็จ” ให้เปลี่ยนข้อเสนอระหว่าง active Save เป็น loading ที่บล็อกการแก้ไข/กดซ้ำ/เลือกไฟล์/การเปลี่ยนหน้าภายใน app ไม่ใช่ปล่อยให้กดยืนยันออกตามข้อเสนอเดิม Browser refresh/close ยังรับประกันการห้ามออกไม่ได้ และการออกไม่พิสูจน์ว่า original request ถูกยกเลิก
- **Q4 remaining clarification:** เสนอ loading เฉพาะสถานะกำลังทำงาน เมื่อได้ confirmed outcome จึงแสดงผลและจบ loading; ถ้า timeout/unknown ให้เปลี่ยนเป็น persistent unresolved status ไม่หมุนล็อกทั้งหน้าถาวร ยัง block mutation/resend ตาม existing HOLD และเปิดอ่าน saved canonical copy ตามสิทธิ์ได้ ไม่ใช้ timeout/HTTP error เพียงอย่างเดียวถือว่าคำขอเดิมล้มเหลวจบแล้ว Postcommit cleanup warning ไม่ย้อนให้ saved snapshot ถูกล็อกทั้งหน้า ขอบเขตนี้รอ human ยืนยัน ไม่เพิ่ม unlock/retry/cancel หรือกำหนดเวลาปลด HOLD ใหม่
- **Q5 approval not inferred:** บรรทัดสุดท้ายของผู้ใช้ระบุ “q4:ตามแนะนำ” ซ้ำ จึงยังไม่บันทึกเป็นอนุมัติ Q5 โดยเดา ต้องยืนยันว่าหมายถึง notice/explicit discard สำหรับ final Correction ที่มี newer pending หรือไม่ Loading ลดการเลือกใหม่ระหว่างรอ แต่ไม่ใช่หลักฐานว่าทุก captured-snapshot/newer-pending interleaving เกิดไม่ได้
- คง Status claimed รอ Q4 clarification และ Q5 label confirmation ไม่มี application/browser/API changes จากการบันทึกครั้งนี้

### Resolution — pyw1tt — อนุมัติ navigation และ loading policy

- **Human approval:** ผู้ใช้ตอบ “q4-5 ตามแนะนำ” ยืนยันการแยก active loading/confirmed outcome/unknown และ notice ของ final Correction ที่มี newer pending ต่อจาก Q1/Q2 ที่ตอบ “ทำตามแนะนำทั้งหมด” และ Q3 ที่ตอบ “ตามแนะนำ” จึงปิด decision ticket นี้ เฉพาะ human acceptance checklist ผ่าน ส่วน browser/HTTP implementation evidence ยังไม่ได้รัน
- **Memory-only และ trigger:** candidate ในกล่อง, confirmed pending File/replacement/removal และ ordinary unsaved form edits ต้องเตือนก่อน app-controlled navigation/route change/back ที่จะทิ้งงาน ไม่มีงานค้างไม่เตือน การเปิดอีกแท็บโดยไม่ทำลายหน้าเดิมไม่เตือนหรือย้าย File ข้ามแท็บ ไม่เพิ่ม storage, auto-upload หรือการกู้ File จาก filename/checkpoint
- **ข้อความสถานะ:** แยก “เลือกในกล่อง — ยังไม่บันทึก”, “ยืนยันไฟล์แล้ว — รอบันทึกแบบฟอร์ม” และ “บันทึกแล้ว” ซึ่งต้องมี explicit Save Draft/Submit/final Save Correction canonical commit สำเร็จ Saved A กับ pending B ต้องจำแนกได้ ไม่เรียก dialog confirmation ว่า upload สำเร็จ

| สถานะก่อนออก/ระหว่างบันทึก | พฤติกรรมที่ตกลง |
| --- | --- |
| ยังไม่เริ่ม Save และมีงานค้าง | Existing platform modal ใช้ “อยู่หน้านี้ต่อ” กับ “ทิ้งการเปลี่ยนแปลงและออก” ยืนยันแล้วทิ้งเฉพาะ unsaved local changes ไม่ลบ saved canonical answer; Cancel/Escape ไม่ทิ้งงาน ไม่มี automatic Save-and-exit/POST/DELETE |
| Active Save กำลังทำงาน | แสดง loading บล็อกการแก้ไข เลือกไฟล์ กดซ้ำ และ app-controlled navigation ให้ครอบคลุม editor/keyboard ไม่ใช่เพียงภาพ loading ที่ยังแก้เซลล์ได้ คง accessible status/focus ตาม platform pattern |
| Confirmed success หรือ confirmed failure | จบ loading แล้วแสดงผลตามหลักฐาน Failure รักษา saved answer และ pending ที่ยังอยู่ ไม่ใช้ HTTP error/timeout เพียงอย่างเดียวเป็น proof ว่าคำขอเดิมจบแล้ว ไม่ล้าง newer pending ที่ไม่อยู่ใน captured snapshot |
| Timeout/unknown | เปลี่ยนจาก loading เป็น persistent “ยังยืนยันผลไม่ได้ ห้ามส่งซ้ำ” คง existing mutation HOLD/checkpoint ไม่ล็อกทั้งหน้าด้วย spinner ถาวร และให้อ่าน saved canonical copy ตามสิทธิ์ ตรวจ original Operation ไม่เริ่ม upload ใหม่เพียงเพราะกลับเข้าหน้า ไม่เพิ่ม manual unlock/resend/DELETE |
| Canonical B commit แล้ว แต่ old A cleanup ล้ม/unknown | ไม่ย้อนให้ saved B กลายเป็น failed save หรือ full-page loading/HOLD แสดง persistent old-public-URL warning และคงการอ่าน/export ของ B ตาม standing cleanup policy |

- **Browser boundary:** refresh/close ใช้ browser prompt แบบ best-effort Browser อาจไม่แสดงหรือไม่ยอมให้กำหนดข้อความเอง Loading ไม่รับประกันห้ามปิดแท็บ/ปิดโปรแกรม และการออกไม่พิสูจน์ว่าคำขอที่ dispatch แล้วถูกยกเลิก ไม่ clear/fence/cancel original Operation โดยอัตโนมัติจาก navigation
- **Final Correction:** หาก captured snapshot เสร็จแต่มี newer File/removal ค้าง ให้คง editor และแจ้งแยกว่ารอบแก้ไขบันทึกแล้วแต่งานใหม่ยังไม่บันทึก ไม่ Save ซ้ำบน retired workspace และไม่ย้าย File ไปรอบใหม่เอง ออกได้หลัง explicit discard-and-exit หากต้องทำต่อให้เปิด current revision เป็น Correction ใหม่และเลือก File อีกครั้ง Loading ลดโอกาสแต่ไม่ลบ safeguard นี้
- **Picker baseline คงเดิม:** Cancel/X ของกล่องไฟล์ทิ้งเฉพาะการเปลี่ยนตั้งแต่เปิดกล่อง รักษา canonical/previous confirmed pending selection ไม่ใช่ full-page discard หรือ DELETE
- **Acceptance ที่ยังต้องทำหลังอนุมัติ implementation:** ใช้ actual supported browser/editor ตรวจ trigger/confirm/cancel/reload, active-cell/keyboard/loading/focus, async completion และ newer-pending cases พร้อมตรวจ saved state เทียบ pending โดยไม่อ้างกู้ bytes หลัง reload HTTP seam ใช้ตรวจ no-extra-POST/DELETE และ canonical preservation ไม่แทน browser evidence ไม่เพิ่ม permanent tests ของ exact copy/source text หรือ mock forwarding
- **Scope / remaining HOLD:** อัปเดต parent intended contract และ map เท่านั้น ไม่มี application/schema/DB/browser/provider changes, commit/push/deploy หรืออนุมัติ execution จากคำตอบนี้ การปิดตั๋วไม่ใช่ implemented behavior ไม่ปลด unknown/provider/release gates และไม่เปลี่ยน public-link/legacy/history/ownership contracts
