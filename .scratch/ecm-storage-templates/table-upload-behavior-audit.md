# พฤติกรรมปุ่ม Upload/DCM ภายในตาราง XLSX

ตรวจเมื่อ 2026-11-17 ตามคำขอให้แยกสิ่งที่ทราบ สิ่งที่ยังไม่แน่ชัด และสิ่งที่ยังไม่มี โดยไม่แก้ application/DB หรือเรียก DCM จริง

**ข้อแก้ไขหลัง snapshot นี้ — 2026-11-17:** ผู้ใช้อนุญาต [นโยบายชื่อซ้ำภายใน batch](spec.md#6-template-mode-upload) สำหรับ storage mode `template` แล้ว รายงาน source/native/smoke ด้านล่างเป็นหลักฐาน **ก่อน** การเปลี่ยนนโยบาย ไม่ใช่ผลทดสอบ implementation ใหม่ Cases 38/39 และ F02 ปรับให้แยก historical behavior ออกจาก intended behavior ปัจจุบัน; findings อื่นรวม F01 ไม่ได้เปลี่ยนตามข้อแก้ไขนี้

นโยบายล่าสุดใช้ namespace เดียวรวม scalar/table upload plans ภายในหนึ่ง explicit Save Draft/Submit/final Save Correction batch ตามลำดับ slot เดิมที่ deterministic จอง natural base filenames ทั้งชุดก่อนจัดชื่อ รายการแรกคงเดิม รายการซ้ำเติม `-(1)`, `-(2)` ก่อน original extension/casing หรือท้ายชื่อหากไม่มี extension โดยข้าม natural base/ชื่อที่จัดให้แล้ว รวม literal `-(1)` ของแม่แบบอื่น Counter reset ทุก batch ไม่ rename ไฟล์เก่า ไม่แก้ frozen `template_name`, original answer metadata หรือ ledger schema; ledger เก็บ destination filename จริง Legacy UUID policy คงเดิม ไม่เพิ่ม row IDs/schema/config/UI

**Local verification supported:** [BATCH evidence](acceptance-matrix.md#batch-filename-verification) บันทึก final HTTP 143 ผ่าน/0 fail และ standalone real-listener/native-Builder smoke ของนโยบายใหม่นี้ แยกจาก snapshot เดิมด้านล่าง ไม่มี live DCM calls; provider suffix routing ยัง **unverified / HOLD** ชื่อข้าม save ยังอาจซ้ำ/overwrite ไม่รับรอง cross-batch uniqueness หรือ independent provider files ไม่ข้าม owner/history/unknown-operation guards และไม่ retry POST/DELETE

**หลักฐานและแผนต่อยอดล่าสุด:** ผู้ใช้ยืนยันการทดลอง DCM จับ wildcard และแยก folder ปี/หมวดหมู่จริงแล้ว ดู [หลักฐานผู้ใช้เพิ่มเติม](planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) ข้อมูลนี้เพิ่มเติมและแทนข้อสงสัยเรื่องการมี wildcard routing ใน snapshot ด้านล่าง ไม่ใช่ผลทดสอบ suffix/byte independence ทุกกรณี ข้อเสนอแก้ชื่อชนข้ามรอบอยู่ที่ [สเปกป้องกันชื่อไฟล์ชนข้ามรอบ](../ecm-attachment-safety/spec.md) และประเด็นที่เหลืออยู่ใน [แผนตัดสินใจความเสี่ยงไฟล์แนบ](../ecm-attachment-safety/map.md) เอกสารทั้งสองไม่ใช่การแก้ application หรือผลรับรอง Production

## ขอบเขตและน้ำหนักหลักฐาน

- **Current Source:** Working Tree ของ `feat/ecm-storage-templates`, HEAD `0a12d91a5b72d4470ae9ceed1c3d4845d2103ced` มีงานที่ยังไม่ commit จึงไม่ถือว่า HEAD เพียงอย่างเดียวระบุเนื้อหาทั้งหมด และไม่อ้างว่าเป็นเวอร์ชัน deployed/Production
- **Canonical local policy:** [สเปกปัจจุบัน](spec.md#implementation-decisions), [คำชี้แจงผู้ใช้ล่าสุด](planning.md#คำชี้แจงและหลักฐานผู้ใช้-วันที่-2026-11-17) และ [acceptance matrix](acceptance-matrix.md) เป็นเอกสารใน repo ไม่ใช่ผล Production
- **รันใหม่ในรอบนี้:** XLSX extraction/validation และ multipart parser จริงด้วยข้อมูลสังเคราะห์ 14 กรณีผ่าน; native ONLYOFFICE 9.4 CLI 3 กรณีปกติผ่าน และ 1 กรณีขอบเขตพบสัญญาไม่ตรงกัน รายละเอียดด้านล่าง ไม่ได้รันชุด tests หรือหน้าเว็บจริง
- **หลักฐานรอบก่อน:** acceptance matrix มีหลักฐาน browser/native/HTTP จาก revision ที่เอกสารระบุ อ่านเป็นประวัติผลตรวจ ไม่เรียกว่าเป็นการรันใหม่บน Working Tree วันนี้
- **Hindsight:** generic recall คืน 10 entries เวลาในผล `2026-11-17 15:21 UTC` ใช้นำทางเท่านั้น ผลไม่ระบุ bank identity, `document_id`, `chunk_id`, `source_path`, `stable_document_id`, `source_revision`/`source_revisions` จึงถือว่าช่อง provenance เหล่านี้ขาด Dedicated recall ของ `pdms-knowledge` สถานะ **skipped: ไม่มีเครื่องมือที่เลือก bank/types/budget ได้ใน session นี้** ไม่อ้างว่าอ่าน canonical bank สำเร็จ และไม่มีการเขียน bank ใด
- `docs/knowledge/` ไม่มีใน checkout นี้ ใช้เอกสารเจ้าของ feature ใน `.scratch/ecm-storage-templates/` และ source ปัจจุบันแยกต่างหาก ไม่ใช้ Memory Summary รับรอง behavior

สถานะในรายงาน:

- **ยืนยัน:** source รองรับ claim; ถ้ามี smoke ใหม่จะระบุเพิ่ม ไม่ได้แปลว่าทดสอบทุกหน้าจอแล้ว
- **จำกัด:** มี implementation แต่มีข้อจำกัดที่ระบุชัด
- **ขัดกัน:** source สองขั้นมี contract ไม่ตรงกัน พร้อมระบุส่วนที่ได้รันจริง
- **ยังไม่ยืนยัน:** ไม่มีหลักฐานเพียงพอ ไม่ถือว่ารองรับหรือพังแน่นอน

## คำตอบสองคำถามหลัก

### Admin: ตาราง 5 แถว วางปุ่มจากแถวแรกแล้วแถวอื่นตั้งค่าตามหรือไม่

**ตามทั้งคอลัมน์ ไม่ใช่คัดลอก config จากปุ่มแรกทีละแถว** เมื่อเป็นตารางกรอกซ้ำที่ Folio map ไว้ เลือกเซลล์ในคอลัมน์ข้อความที่กรอกเอง แล้ววางปุ่มสำเร็จ คำสั่งจะวนทุกแถวใน table body และสร้าง/ปรับปุ่มให้ครบ ตาราง 5 แถวจึงได้ 5 ปุ่มต่อคอลัมน์แนบ [S01][S02]

ทุกแถวใช้ binding/Tag และ Storage Template/category/requiredness ของคอลัมน์ร่วมกัน แต่แยกช่องไฟล์ด้วย `row_index` ไม่มี Tag หรือแม่แบบปลายทางแยกรายแถว [S03][S09][P01]

**ข้อแม้:** ตารางต้องมี mapping ของ Folio ไม่ใช่เพียงตีเส้นเซลล์หรือ copy drawing; เลือกหลายคอลัมน์พร้อมกันไม่ได้ และการ publish ตรวจปุ่มจริง/ตำแหน่ง/Tag/จำนวน ไม่ใช่สร้างปุ่มที่ขาดให้เอง [S01][S04]

### User: กดเพิ่มแถว ถ้าแถวต้นแบบมีปุ่มจะตั้งค่าแม่แบบให้หรือไม่

**ได้ เมื่อใช้ปุ่ม “เพิ่มแถว” ของ Folio และคอลัมน์นั้นเป็นช่องแนบที่ตั้งค่าไว้แล้ว** ปุ่มนี้ append ท้ายตารางผ่าน internal Save Draft; builder ใช้แถวแรกของ body เป็น prototype ของรูปแบบ แล้วสร้างปุ่มใหม่ตาม column binding และขอบเขตตารางใหม่ [S05][S06][S07]

แถวใหม่ใช้แม่แบบ/category/requiredness เดิม แต่ **ไม่คัดลอกไฟล์ ค่ากรอก หรือ URL ของแถวต้นแบบ** เพราะล้าง input values/hyperlinks ของแถวใหม่ การเพิ่มแถวไม่ใช่การ upload ไป DCM [S06][S07][P02]

รัน native CLI รอบนี้แล้ว: 5 แถว/2 คอลัมน์ได้ 10 ปุ่ม; append เป็น 6 แถวได้ 12 ปุ่ม; ช่อง A9/B9/C9 ว่าง ขณะที่ค่าต้นแบบ A4 ยังอยู่

## กรณีที่ตรวจ: 64 สถานการณ์

### A. Admin และการตั้งค่าคอลัมน์

| # | กรณี | พฤติกรรมปัจจุบัน / ข้อจำกัด | หลักฐาน |
| --- | --- | --- | --- |
| 1 | ตารางมี 5 แถว วางปุ่มจากเซลล์แถวแรก | **ยืนยัน + native smoke:** วางครบทั้ง 5 แถวของคอลัมน์ ไม่ต้องตั้ง 5 ครั้ง | S01, S02 |
| 2 | เลือกเซลล์แถวกลางแทนแถวแรก | **ยืนยันจาก source:** target คือคอลัมน์ จึง project ทุกแถวใน body ไม่ใช่เฉพาะเซลล์ที่เลือก | S01, S02 |
| 3 | มีคอลัมน์แนบ 2 คอลัมน์ | **ยืนยัน + native smoke ใน snapshot เดิม:** แต่ละคอลัมน์มี binding/การตั้งค่าของตัวเอง ตาราง 5 แถวได้ 10 slots/ปุ่ม; ชื่อใน batch ปัจจุบันต้องจัดตามข้อแก้ไขด้านบน ส่วน provider routing/ข้าม batch ยังไม่รับรอง | S02, S09, S12; amendment verification pending |
| 4 | อยากให้แถว 1 และแถว 2 ใช้ template หรือ required ต่างกัน | **ไม่มีในโมเดลปัจจุบัน:** ตั้งค่าระดับคอลัมน์ ไม่ใช่รายแถว User เปลี่ยนปลายทางไม่ได้ | P01, S09 |
| 5 | เลือกหลายคอลัมน์/คร่อม body/header/ช่วง map ซ้อนกัน | **ยืนยัน:** ปฏิเสธ target ตารางที่ไม่อยู่ภายใน body/ไม่ใช่คอลัมน์เดียว; header ที่อยู่นอก body ไม่กลายเป็นปุ่มของตาราง | S01 |
| 6 | วางในคอลัมน์สูตร/number/dropdown หรือมี source/Prefill | **ยืนยัน:** attachment ต้องเป็น text ที่ไม่ computed; contract ไม่อนุญาต choices/source/Prefill สำหรับ attachment | S01, S17 |
| 7 | ปุ่มหาย ซ้ำ ย้ายผิด Tag หรือ config ไม่ครบตอน publish | **ยืนยัน:** ตรวจ managed OLE/marker/binding/row/ตำแหน่ง และจำนวนเท่าจำนวนแถว; ไม่ครบจะไม่ publish ไม่ใช่การซ่อมอัตโนมัติ | S04 |
| 8 | เปลี่ยน catalog/template หลัง publish หรือทำสำเนา Form | **ยืนยัน:** Published ใช้ค่า frozen เดิม; เปลี่ยนสัญญาต้อง duplicate เป็น Form/link ใหม่ สำเนาไม่คัดคำตอบ/ไฟล์ User; Draft ที่ choice stale ต้องเลือกใหม่ | P01, P03, S18 |

### B. เพิ่ม/ลบแถว

| # | กรณี | พฤติกรรมปัจจุบัน / ข้อจำกัด | หลักฐาน |
| --- | --- | --- | --- |
| 9 | User กด “เพิ่มแถว” | **ยืนยัน + native smoke:** append ท้าย 1 แถว ไม่ใช่แทรกตรงเซลล์ที่เลือก; regenerate ปุ่มตามจำนวนแถวใหม่ | S05, S06, S07 |
| 10 | ต้นแบบมีไฟล์/URL/ค่ากรอกอยู่ | **ยืนยัน + native smoke:** แถวใหม่ล้าง input/hyperlinks ไม่คัดลอกไฟล์เดิม; ใช้รูปแบบจากแถวแรก | S06 |
| 11 | มี pending File หรือ removal แล้วเพิ่มแถว | **ยืนยัน:** อนุญาต append เมื่อ index ตรงจำนวนแถว; รักษา pending ผ่าน verified document/row transition ไม่ upload จาก internal save | S08, S07, E01 |
| 12 | ลบแถวว่างก่อนหน้าแถวที่มี saved/pending file | **ยืนยัน:** แถวถัดไปเลื่อนตำแหน่ง; canonical/pending mapping ปรับตาม transition คู่ URL/token เดิมไม่เปลี่ยนเพียงเพราะเลื่อนแถว | S07, S08, E01 |
| 13 | ลบแถวเป้าหมายที่มี pending File/removal/invalid file | **ยืนยัน:** host บล็อก ให้บันทึกหรือยกเลิก pending ในแถวนั้นก่อน ไม่ทิ้ง File เงียบ ๆ | S08 |
| 14 | ลบแถวที่มีไฟล์บันทึกแล้ว โดยไม่มี pending ในแถวนั้น | **ยืนยันสำหรับจำนวนแถวมากกว่า 1:** เอาแถวนั้นออกจาก canonical mapping และขยับผู้รอด Internal row operation ไม่ใช่ DCM DELETE; ไม่รับรองว่าลบไฟล์กายภาพทันที | S07, P02, E01 |
| 15 | เหลือ 1 แถว แล้วกดลบแถวนั้น | **ขัดกัน:** native builder ที่รันจริงล้างค่าแต่คง 1 แถว/ปุ่ม; server guard ต้องการจำนวนลดเป็น 0 `[INFERENCE]` หากถึง guard นี้จะถูกปฏิเสธ 409 ยังไม่ได้ยิง HTTP/UI ของกรณีนี้ | S06, S07; finding F01 |
| 16 | เพิ่ม/ลบแถวในหน้า Correction | **ไม่มีปุ่มแถวใน UI ปัจจุบัน:** runtime สร้างปุ่มเพิ่ม/ลบเฉพาะ action ที่ไม่ใช่ Correction; ยังแก้ไฟล์ใน slots เดิมตามสิทธิ์ Correction ได้ | S05, P02 |

### C. เลือกไฟล์และสถานะที่ยังไม่บันทึก

| # | กรณี | พฤติกรรมปัจจุบัน / ข้อจำกัด | หลักฐาน |
| --- | --- | --- | --- |
| 17 | หนึ่งช่องแนบไฟล์หลายไฟล์พร้อมกัน | **ไม่มี:** หนึ่ง File ต่อ binding/physical-row slot ไม่ใช่รายการไฟล์ | S09, S10 |
| 18 | เลือก A แล้วเลือก B ในกล่องเดิม | **ยืนยัน:** B แทน candidate A ในกล่อง ไม่เพิ่มเป็นไฟล์ที่สอง และยังไม่ upload | S10 |
| 19 | เลือกไฟล์แล้วกด Cancel หรือ X ก่อนยืนยัน | **ยืนยัน:** ทิ้งการเปลี่ยนในกล่องรอบนั้น รักษา saved attachment/previous confirmed pending ของ host ไม่ลบไฟล์เก่าจาก DCM | S10, P04 |
| 20 | กด Save ในกล่องเลือกไฟล์ | **ยืนยัน:** ยืนยัน pending ให้ host เท่านั้น ต้อง Save Draft/Submit หรือ final Save Correction ที่หน้าหลักจึง upload | S10, P02 |
| 21 | ยืนยันนำไฟล์ออก แล้วเปลี่ยนใจ | **ยืนยัน:** removal เป็น pending เช่นกัน ต้องผ่านการยืนยัน/บันทึก; กล่องใช้ baseline กับ contextual undo/cancel ไม่ DELETE ทันที | S10, P04 |
| 22 | Refresh/ปิดแท็บก่อน Save Draft/Submit | **จำกัด:** File bytes อยู่ host memory ไม่ถูกเก็บใน sessionStorage; checkpoint identity ที่กู้ได้ไม่ใช่สำเนา File ห้ามสัญญาว่าไฟล์ที่เลือกจะกลับมาหลัง reload | S11 |
| 23 | เปิด Draft ที่บันทึกสำเร็จแล้วใหม่ | **ยืนยัน:** อ่าน canonical saved receipt ของแต่ละ physical row ไม่ต้องเลือกไฟล์เดิมใหม่เพื่อคงค่า การเริ่มรอบ XLSX ใหม่หลัง Submit เป็นคนละกรณีและเริ่มว่าง | P04, E01, S09 |
| 24 | พิมพ์ URL เองในเซลล์แนบ หรือส่ง token/object ที่สร้างเอง | **ยืนยัน + extraction smoke:** URL ในเซลล์ไม่ทำให้เป็น canonical attachment; server ใช้ metadata ที่เชื่อถือได้และตรวจ slot/ownership ไม่รับ URL string เป็นหลักฐาน upload | S09, S12, S07 |

### D. Requiredness แถวว่าง และขอบเขตไฟล์

| # | กรณี | พฤติกรรมปัจจุบัน / ข้อจำกัด | หลักฐาน |
| --- | --- | --- | --- |
| 25 | มีปุ่ม 5 แถว แต่ไม่กรอก/ไม่แนบทุกแถว | **ยืนยัน + extraction smoke:** แถวว่างทั้งหมดไม่นับเป็น active; ไม่บังคับแนบเพียงเพราะมีปุ่ม แม้คอลัมน์ required | S13 |
| 26 | แถวมีข้อมูลธรรมดา แต่ required attachment ว่าง | **ยืนยัน + extraction smoke:** Draft เก็บร่างได้; Submit ตรวจและแจ้งช่องแนบ/เลขแถวของ active row | S13, S12 |
| 27 | แถวมีแต่ไฟล์ ไม่มีข้อมูลช่องอื่น | **ยืนยัน + extraction smoke:** retained เป็น active row และตรวจ required ordinary columns อื่นด้วย ไม่ตัดแถวทิ้ง | S13 |
| 28 | ไฟล์ 0 bytes หรือเลือก pending ไฟล์ในแถวว่าง | **ยืนยัน:** saved 0-byte receipt นับว่ามีไฟล์; selected valid File ทำให้แถว active สำหรับ validation ระหว่าง save แต่ยังไม่ใช่ saved receipt จน upload/commit สำเร็จ | S09, S13; smoke ใหม่ |
| 29 | แถวแรก/กลางว่าง แต่ไฟล์อยู่แถวที่ 3/5 | **ยืนยัน + extraction smoke:** ใช้ zero-based physical `row_index` ไม่ใช่ตำแหน่งใน JSON ที่ตัดแถวว่าง; หลาย attachment columns ต้องชี้ physical row เดียวกัน | S09, S13 |
| 30 | ขนาด 0, 10,000,000 หรือ 10,000,001 bytes | **ยืนยัน parser smoke:** 0 และ 10,000,000 รับ; 10,000,001 ปฏิเสธ 413; picker ปฏิเสธ candidate เกินขนาดและไม่แทน candidate ที่ valid ด้วยไฟล์ที่ผิด | S10, S14 |
| 31 | ชนิดไฟล์อื่น/ไม่มีนามสกุล/ไฟล์เข้ารหัส | **ยืนยันระดับ Folio:** ไม่บังคับ PDF และไม่ถอดรหัส/preview; คง bytes/นามสกุลเดิม ไม่เท่ากับรับรองว่า DCM รับและคืนทุกชนิดได้ หรือเนื้อหาปลอดภัย | S12, S14, P02; E02 |
| 32 | หลายแถวจน metadata รวมเกินขอบเขต | **ยืนยัน + smoke:** canonical JSON รวมทุก field/file metadata ต้องไม่เกิน 262,144 UTF-8 bytes แยกจากเพดาน 10,000,000 bytes ต่อไฟล์; ไม่ตัดแถว/token ทิ้งเพื่อให้ผ่าน | S09, S12 |

### E. Save และชื่อปลายทาง DCM

| # | กรณี | พฤติกรรมปัจจุบัน / ข้อจำกัด | หลักฐาน |
| --- | --- | --- | --- |
| 33 | แถว/ไฟล์/metadata เดิมไม่เปลี่ยน แล้ว Save อีกรอบ | **ยืนยัน:** reuse saved reference ไม่ upload ใหม่เพราะมีปุ่มหรือกด Save เฉย ๆ | S12, E01 |
| 34 | เปลี่ยน `docs_number` แต่ไม่เลือกไฟล์ใหม่ | **ยืนยันระดับ implementation:** ทุก saved slot ที่เปลี่ยน metadata ต้องอ่าน original จาก DCM ด้วย trusted receipt และตรวจ size/hash ก่อนส่งชื่อใหม่ อ่านไม่ได้หยุดก่อน write ใหม่ | S12, E01, E02 |
| 35 | เปลี่ยนเลขและเลือก replacement เฉพาะบางแถว | **ยืนยัน:** slot ที่มี replacement ใช้ File ใหม่; slot อื่นอ่าน original ที่บันทึกไว้ ไม่มีการใช้ไฟล์จากแถวข้างเคียงแทน | S12 |
| 36 | เปลี่ยนเฉพาะ `fiscal_year` | **ยืนยันสำหรับ mode template:** ไม่ทำให้ attachment upload ใหม่ ระบบ attachment ใหม่ไม่บังคับ field นี้ แต่ถ้า Form ตั้ง required ตามกฎ Field ปกติยังต้องกรอก โหมด legacy ต่างกัน | S12, P02 |
| 37 | ไม่กรอกเลขหนังสือ/เลขมี `/` หรือ `\`/ชื่อไม่ปลอดภัย | **ยืนยัน:** upload planner ปฏิเสธ ไม่เปลี่ยนชื่อให้เอง การมี field `docs_number` ใน template ไม่เท่ากับมี user value ที่ใช้สร้างชื่อได้ | S12, S18 |
| 38 | หลายแถวเลือกไฟล์ชื่อต้นฉบับต่างกัน แต่นามสกุลเดียวกัน | **ยืนยัน local policy ใหม่:** template-mode batch คงชื่อแรกและเติม `-(n)` ก่อน original extension ให้รายการซ้ำ ไม่ใช้ original basename/row ID; HTTP และ filename-keyed provider smoke ผ่าน ส่วน DCM routing ยัง HOLD | BATCH ใน acceptance matrix; S12/P05 เป็น historical snapshot |
| 39 | คนละคอลัมน์ แต่เลือก Storage Template เดียวกัน | **ยืนยัน local policy ใหม่:** จัดชื่อร่วมทุก scalar/table upload plan ใน batch เดียว ไม่ reset counter ต่อคอลัมน์/ตาราง จอง natural bases ไม่แย่งชื่อ literal `-(1)`; ต่าง batch ยังอาจซ้ำและไม่รับรอง provider independence | BATCH ใน acceptance matrix; spec ข้อ 6 |
| 40 | ชื่อชนกับ Response คนอื่น/Submission/history ที่ Folio รู้จัก | **ยืนยัน:** ledger admission ตรวจ ownership/protected references ก่อน dispatch และหยุด conflict; ไม่ใช่การค้นพิสูจน์ว่าไม่มีไฟล์ภายนอก Folio ที่ชื่อเดียวกันทุกไฟล์ใน DCM | S15 |

### F. Batch, failure และ cleanup

| # | กรณี | พฤติกรรมปัจจุบัน / ข้อจำกัด | หลักฐาน |
| --- | --- | --- | --- |
| 41 | Save หลายไฟล์หลายแถวพร้อมกัน | **ยืนยัน:** วางแผนก่อน dispatch และ upload sequential; Folio commit เป็น complete snapshot ไม่ส่งผลว่าแต่ละไฟล์สำเร็จแล้วเกิด partial Submission | S12, P02 |
| 42 | แถวก่อนส่งสำเร็จ แต่แถวถัดไปล้มเหลว | **ยืนยัน:** ไม่ commit คำตอบบางส่วน แต่ provider อาจได้รับไฟล์บางไฟล์แล้ว ต้องแยก external effects จาก DB transaction | S12, P02 |
| 43 | Timeout/response ผิดรูป/ขาด receipt หลังส่ง | **ยืนยัน:** ถือ unknown outcome และ HOLD mutations ไม่ retry upload เพราะเดาว่าไม่สำเร็จ ต้องตรวจ Operation/checkpoint เดิม | S12, P02, E02 |
| 44 | Provider เปลี่ยนไฟล์เดิมแล้ว Folio commit ไม่สำเร็จ | **จำกัด:** canonical เก่าอาจยังอยู่ แต่ bytes ที่ URL เดิมอาจเป็นของใหม่แล้ว ไม่มี external rollback ที่พิสูจน์ได้ ห้ามรับรองว่าไฟล์เก่าเดิมทุกกรณี | P02, P05, S12 |
| 45 | หลายแถวได้ token/link เดียวกัน หรือแทนที่ same identity | **ยืนยันข้อป้องกัน + จำกัด independence:** ไม่ DELETE shared identity เพียงเพราะ attempt เก่าหมด ref; ทุก URL อาจอ่าน bytes ใหม่ร่วมกัน ไม่มี independent version ต่อแถวที่พิสูจน์จาก receipt เพียงอย่างเดียว | S15, P05, E01 |
| 46 | บันทึกไฟล์ใหม่สำเร็จ แต่ลบไฟล์เก่าไม่สำเร็จ | **ยืนยัน:** saved snapshot ยังใช้ได้พร้อม persistent cleanup warning; ordinary save ถัดไปไม่ทำให้คำเตือนหายหรือ retry DELETE เอง | P02, E01 |
| 47 | เพิ่ม/ลบแถวหรือ internal project/workspace save | **ยืนยัน:** ไม่ upload/delete DCM จากคำสั่งภายใน; pending ต้องคงอยู่ผ่าน verified transition ไม่เท่ากับ upload ทุกครั้งที่ทำ Save Draft ภายใน | P02, S07, S08 |
| 48 | Unknown upload/DELETE ค้าง แล้วรอ/ใส่โน้ต/ค้นไม่เจอ | **ยังไม่มีสัญญาปลดล็อกที่ปลอดภัยด้วยวิธีเหล่านี้:** เวลา/โน้ต/search ว่างไม่ใช่ settlement proof; external evidence ยังเป็น release HOLD | P02, E02 |

### G. History, exports และสิทธิ์

| # | กรณี | พฤติกรรมปัจจุบัน / ข้อจำกัด | หลักฐาน |
| --- | --- | --- | --- |
| 49 | User ส่งแล้วต้องการแก้ไฟล์ | **ยืนยัน:** ใช้ Draft รอบใหม่ตาม flow XLSX หรือ Admin Correction ที่เข้าเงื่อนไข ไม่แก้ immutable Submission ตรง ๆ; Draft รอบใหม่ไม่ copy ไฟล์รอบก่อน | P04, E01 |
| 50 | Admin Correction เปลี่ยนไฟล์/metadata | **ยืนยัน:** final Save Correction เท่านั้นที่ upload ใช้ frozen contract ของฉบับนั้น; ป้องกัน overwrite ปลายทางที่ Submission/older Correction อ้างอยู่ จึงอาจต้องใช้เลขปลายทางใหม่ตาม flow ที่อนุญาต | P02, S15, E01 |
| 51 | Viewer/หน้าอ่านอย่างเดียว/ดาวน์โหลด XLSX/PDF | **ยืนยันจาก canonical และหลักฐานรอบก่อน:** ใช้ URL ของ revision ที่เลือก ไม่มี upload controls ใน derived exports ไม่ lookup ไฟล์ล่าสุดมาทดแทนเอง | P02, E01 |
| 52 | มี File/removal pending แล้วกดดาวน์โหลด | **ยืนยัน:** ต้อง explicit save ก่อน ไม่ให้ export แสดงเหมือน pending file บันทึกแล้ว; export เองไม่ upload | P02, E01 |
| 53 | URL ประวัติเสียหรือ DCM ถูกแก้จากภายนอก | **จำกัด:** ไม่สลับไป latest file และ Folio snapshot ไม่ทำ public URL ให้ immutable; ขอบเขตป้องกันของ Folio ไม่ป้องกันการแก้ bytes นอก Folio ทุกกรณี | P02, P05 |
| 54 | ผู้มี URL แต่ไม่มีสิทธิ์ Form | **จำกัดตาม accepted public-link policy:** สิทธิ์หน้า Folio ไม่ได้ทำให้ DCM public URL เป็น private อย่าถือว่าแยกไฟล์ตาม row/role แล้ว URL จะมี authorization ตามนั้น | P02, P04 |
| 55 | ลบแถว กับลบทั้ง Response/Archive | **ยืนยัน:** เป็นคนละ lifecycle; internal row delete ไม่ DELETE DCM ส่วน whole-Response ใช้ reference-fenced cleanup และ Archive เก็บประวัติ/ไฟล์ไว้ | S07, P02, P04 |
| 56 | ฟอร์มเก่า PoC หรือ legacy category mode | **ยืนยัน:** ไม่แปลงเพียงเพราะมี drawing หน้าตาคล้ายกัน Old PoC ไม่กลายเป็น durable upload เอง; legacy Published คง filename/multipart policy เดิม ไม่ใช้คำอธิบาย mode template แทนทั้งหมด | P03, P04 |

### H. การแก้ตารางผ่าน native editor และกรณียังไม่ยืนยัน

| # | กรณี | สถานะและสิ่งที่ไม่ควรสรุปเอง | หลักฐาน / สิ่งที่ต้องตรวจเพิ่ม |
| --- | --- | --- | --- |
| 57 | Native insert/delete แถวเอง ไม่ใช้ปุ่ม Folio | **ยังไม่ยืนยัน end-to-end:** supported remap ที่อ่านพบคือ append/delete-selected ของ Folio บางการเปลี่ยนโครงสร้างถูกปฏิเสธ แต่ห้ามรับรองว่า native ทุกคำสั่งถูก detect/แก้ให้ | S05, S07, S08; ต้อง native UI + saved row/file assertions |
| 58 | Sort/ลากย้ายแถว/คัดลอกทั้งแถวข้ามกัน | **ยังไม่ยืนยัน และเสี่ยงผูกข้อมูลผิดไฟล์:** ใช้ physical index ไม่มี stable row ID สำหรับ reorder ห้ามถือว่าตารางที่ยังมีจำนวนแถวเท่าเดิมจะย้าย File ตามข้อมูลเสมอ | S09, S07; ต้อง sort/move บน rows ที่มีไฟล์ bytes ต่างกัน |
| 59 | Copy/paste drawing หรือ paste URL ไปอีกแถว | **ไม่ใช่ supported transfer API:** pasted URL ไม่ทำให้ได้ canonical receipt; duplicated drawing อาจไม่ผ่าน validation ยังไม่ยืนยัน native paste ทุกชนิด | S04, S09; extraction smoke สำหรับ typed URL |
| 60 | Undo/Redo หลังเลือก File/หลัง internal save | **ยังไม่ยืนยัน:** Excel Undo ไม่ใช่หลักฐานว่า host pending, canonical JSON หรือ DCM effects ถูก undo ด้วย ห้ามอ้าง rollback จากหน้าตา cell | S10, S11, P02; ต้องตรวจ 3 state พร้อมกัน |
| 61 | Filter/hidden rows/collapsed rows/คอลัมน์กว้าง 0 | **ยังไม่ยืนยัน UI:** physical index ไม่ใช่ลำดับเฉพาะแถวที่เห็น Geometry command บางกรณีปฏิเสธพื้นที่แสดงผล 0 แต่ไม่ได้พิสูจน์ filter/hidden behavior ทุกกรณี | S02, S09; ต้องกดปุ่มจริงในแถวที่ซ่อน/กรองแล้วเปิดใหม่ |
| 62 | Merged cells หลายแถว/ลากขยายตารางหรือย้ายข้าม sheet | **ยังไม่ยืนยัน combination นี้:** target/named anchors ตรวจขอบเขตและ sheet แต่ไม่เท่ากับรับรองปุ่ม/row identity ในทุก merge/move | S01, S02, S04; ต้อง actual sheet geometry/mapping proof |
| 63 | เปิดหลายแท็บ/reconnect ระหว่าง add/delete/เลือกไฟล์ | **มี scope/revision/lease/transition guards แต่ยังไม่ยืนยันทุก interleaving:** ห้ามสัญญาว่า File bytes ย้ายข้ามแท็บหรือ reload ได้ การเปิดเก่าต้องไม่ถูกใช้เดาตำแหน่งใหม่ | S08, S11, S07; ต้อง controlled two-openings UI scenario |
| 64 | ตารางใหญ่มาก/หลายไฟล์รวมมาก หรือ DCM ทุกชนิด/ทุก boundary | **ยังไม่ยืนยัน capacity/provider matrix:** parser budget คำนวณตาม slots และรับ request bytes ทั้ง batch; upload sequential ไม่ใช่ streaming/performance guarantee ทั้งระบบ Live ที่บันทึกไว้พิสูจน์เพียง PDF 629 bytes | S14, S12, E02 |

## Findings และคำแนะนำตามลำดับ

### F01 — ลบแถวเดียวสุดท้าย: contract ไม่ตรงกัน

**สถานะ: ขัดกัน; native builder reproduced, HTTP/UI ยังไม่รัน**

- [builder-script.ts:175–185](../../apps/server/src/documents/spreadsheets/builder-script.ts#L175-L185): `count === 1` ล้าง input/hyperlinks และคง table body ไว้ 1 แถว
- [spreadsheet-document.ts:427–439](../../apps/server/src/operations/spreadsheet-document.ts#L427-L439): เมื่อมี attachment และ rowChange delete กำหนด `newRowCount === oldRowCount - 1` จึงคาด 0
- Native CLI ของ production-generated script ที่รันจริงได้ `old=1, new=1` และยังมี 2 ปุ่มสำหรับ 2 คอลัมน์ หลัง values ถูกล้าง
- `[INFERENCE]` หาก HTTP operation ผ่านเงื่อนไขก่อนหน้าและถึง guard นี้ จะ fail `409 / attachment_row_mapping_unproven` ไม่ได้ยืนยันว่า toast/UI แสดงอย่างไร
- **คำแนะนำ:** กำหนด behavior สุดท้ายให้สอดคล้องกัน แนะนำคง 1 แถวว่างตาม builder เดิม แต่ต้องปรับ canonical attachment/reference/pending mapping ของการล้างแถวด้วย ไม่แก้แค่ตัวเลข guard แล้วปล่อย metadata ของไฟล์ค้างผิดแถว จนแก้ครบ อย่ารับรองว่าปุ่มลบล้างแถวสุดท้ายได้

### F02 — ชื่อปลายทางซ้ำ: snapshot เดิมถูกแทนที่ด้วย batch numbering

**สถานะ: implementation และ integrated HTTP/standalone smoke ยืนยัน local behavior แล้วตาม BATCH; provider suffix routing unverified / HOLD**

Snapshot source เดิม [S12] ใช้ `<docs_number>-<template_name>.<original-extension>` และส่งชื่อซ้ำ unchanged ตามข้อยกเว้นชั่วคราวเดิม [P05] ส่วนนี้เป็นประวัติ ไม่ใช่นโยบายปัจจุบัน ไม่มี original basename, row ID หรือ UUID เพิ่มในโหมด template

ตัวอย่าง intended policy ใหม่: `docs_number=DOC-001`, template `หลักฐาน`, แถว 1 เลือก `a.pdf`, แถว 2 เลือก `b.pdf` ใน batch เดียว จะส่ง `DOC-001-หลักฐาน.pdf` และ `DOC-001-หลักฐาน-(1).pdf` ตามลำดับ slot เดิม หากอีก plan มี natural base `DOC-001-หลักฐาน-(1).pdf` ต้องสงวนชื่อนั้นและให้รายการซ้ำข้ามเป็น `DOC-001-หลักฐาน-(2).pdf` คง original extension/casing; extensionless เติมเลขท้ายชื่อ ไม่ตีความจุดในเลขหนังสือเป็น extension

**ความเสี่ยงที่ยังอยู่:** counter reset ทุก batch จึงไม่ป้องกัน cross-save overwrite และ suffix อาจเปลี่ยนการจับแม่แบบ/ปลายทางของ DCM ผล native/provider เดิมไม่ได้ exercise กติกาใหม่ ส่วน planner/HTTP ใหม่มี [BATCH evidence](acceptance-matrix.md#batch-filename-verification) แล้ว แต่ยังรอ provider acceptance ที่ได้รับอนุญาตก่อนอ้าง DCM จริง ยังคง owner/history/unknown-operation guards, no retry POST/DELETE และ no shared-identity DELETE ไม่ใช้เลขต่อท้ายเพื่อหลบ protected conflict หรืออ้างว่า provider bytes immutable

### F03 — Native reorder/copy/Undo ยังไม่มีหลักฐานรับรองครบ

**สถานะ: unverified ไม่ใช่สรุปว่าทุกคำสั่งพังหรือ fail-closed เสมอ**

**คำแนะนำ:** การใช้งานตอนนี้ให้ใช้ปุ่ม Folio สำหรับเพิ่ม/ลบแถว และอย่ารับรอง sort/drag/copy เป็นการย้ายไฟล์ สร้าง acceptance scenario โดยใช้แถว A/B ที่ ordinary data ต่างกันและไฟล์ bytes ต่างกัน ตรวจทั้ง cell, canonical `row_index`, pending slot และ bytes ปลายทางหลัง save/reopen ก่อนประกาศว่ารองรับการ reorder

### F04 — ขอบเขต DCM จริงและ unknown settlement ยัง HOLD

**สถานะ: release evidence ไม่ครบ ไม่ใช่ไม่มี code** [E02]

**คำแนะนำ:** แยกการทดสอบ local ออกจาก provider acceptance ต้องมีขอบเขตที่อนุญาตก่อนทดสอบ DCM เพิ่ม: ทุกชนิดไฟล์/0 bytes/10,000,000 bytes/เข้ารหัส/ไม่มีนามสกุล, same-identity overwrite/no-extra-DELETE, unknown upload/DELETE settlement และ deployed revision ใช้ไฟล์สังเคราะห์ที่ไม่ชนของจริง ห้ามลองส่งซ้ำเมื่อไม่ทราบผล

### F05 — Pending File ไม่ใช่ข้อมูลร่างถาวร

**สถานะ: ข้อจำกัดที่ยืนยันจาก source** [S10][S11]

**คำแนะนำ:** ขั้นตอนใช้งานควรบอกชัด `เลือกไฟล์ > ยืนยันในกล่อง > Save Draft/Submit ที่หน้าหลัก` ก่อน refresh/ปิดแท็บ การเพิ่มแถวที่ระบบ save ภายในไม่ใช่หลักฐานว่า upload pending สำเร็จแล้ว

## หลักฐานที่รันใหม่ในรอบนี้

### Smoke A — real XLSX extractor และ multipart request parser

เรียก Bun แบบ in-memory ใช้ `fixtureWorkbook`, `readSpreadsheetWorkbook`, `resolveSpreadsheetContract`, `extractSpreadsheetData`, `spreadsheetAttachmentSlots`, `canonicalTableAttachments`, `checkAttachmentJsonBytes`, `nativeResponseRequest` จาก Working Tree จริง ไม่ mock ผลของฟังก์ชันเหล่านี้ ไม่เชื่อม DB/DCM

ผล **14 กรณีผ่าน, exit 0**:

1. 5 physical rows × 2 attachment columns ได้ 10 slots ที่ key ไม่ซ้ำและใช้ template ของคอลัมน์ร่วมกัน
2. ปุ่ม/config อย่างเดียวไม่ทำ empty row ให้ active/required
3. Saved zero-byte attachment-only row index 2 อยู่ครบและฟ้อง required ordinary field ที่ A6
4. Pending selected row index 4 ทำแถว active แต่ canonical receipt ยังเป็น null
5. Optional attachment ในแถวว่างกระตุ้น required ordinary/attachment columns อื่น
6. Draft ยอมขาด required; Submit ระบุ missing attachment ที่ B4
7. Multiple attachment columns ใน physical row เดียวกันคง receipt ที่ถูกต้อง
8. row_index ขัดกันใน row object เดียวถูกปฏิเสธ
9. physical row ซ้ำและ out-of-range ถูกปฏิเสธ
10. Typed URL ใน attachment cell ไม่ถูกนับเป็น saved file
11. JSON metadata เกิน 262,144 UTF-8 bytes ถูกปฏิเสธ
12. Multipart attachment 0 bytes รับได้
13. Multipart attachment 10,000,000 bytes รับได้
14. Multipart attachment 10,000,001 bytes ถูกปฏิเสธ HTTP 413

### Smoke B — real ONLYOFFICE native builder และ saved XLSX proof

ใช้ existing `SpreadsheetRuntime` จาก `apps/server/test/spreadsheet-runtime/runtime-fixture.ts` ไม่เรียก test runner ภายในสร้าง container ของงานนี้เท่านั้น `--network=none --pull=never` image `onlyoffice/documentserver:9.4.0.1` image ID `sha256:5dce463a5cdb73e31cec3f6ecf47066348bece06ebf96684c05c3521c77babdd`

รัน production `spreadsheetBuilderScript` โดยปรับเฉพาะ transport path ให้เป็นไฟล์ภายใน isolated container และตรวจ output XLSX ด้วย production reader/contract/saved button validator:

- **PASS:** body A4:C8, 2 attachment columns สร้างปุ่ม 10 ปุ่ม โดย proof column มี rowIndex 0–4
- **PASS:** append index 5 เป็น 6 แถว/12 ปุ่ม; A9/B9/C9 ว่าง; A4 ของเดิมยังอยู่
- **PASS:** delete middle index 2 จาก 6 แถวเป็น 5 แถว/10 ปุ่ม; proof column reindexed 0–4
- **OBSERVED mismatch:** delete จาก body A4:C4 ยังคง 1 แถว/2 ปุ่มและล้าง ordinary value ตาม F01 ไม่เรียกกรณีนี้ว่า end-to-end PASS
- Exit 0 ของตัว smoke แปลว่า assertions ตรง observed behavior รวม mismatch ไม่ใช่การรับรองว่าไม่มี bug
- `finally` หยุด/ลบเฉพาะ container และ temp directory ของ smoke สำเร็จ ไม่มีการแก้ไฟล์ source, application DB, user services หรือ DCM

**ไม่ได้รันใหม่:** browser UI, full HTTP flow, application test suites, DCM endpoint หรือ Production ไม่มี code fix ในรอบนี้

## แหล่งอ้างอิง

### Historical Source snapshot ก่อนข้อแก้ไข batch naming — authoritative เฉพาะ Working Tree ตอนตรวจ

- **S01:** [spreadsheet-upload-poc.js:50–99](../../apps/onlyoffice-plugin/src/spreadsheet-upload-poc.js#L50-L99), [227–248](../../apps/onlyoffice-plugin/src/spreadsheet-upload-poc.js#L227-L248): selection/table column target
- **S02:** [upload-poc-command.js:22–145](../../apps/server/src/documents/spreadsheets/upload-poc-command.js#L22-L145): project native OLE ทุกแถว, metadata, geometry/locks
- **S03:** [spreadsheet.js:1811–1919](../../apps/onlyoffice-plugin/src/spreadsheet.js#L1811-L1919): Admin mapping/placement/save flow
- **S04:** [upload-poc.ts:171–254](../../apps/server/src/documents/spreadsheets/upload-poc.ts#L171-L254), [310–357](../../apps/server/src/documents/spreadsheets/upload-poc.ts#L310-L357): actual saved-button identity/completeness validation
- **S05:** [spreadsheet.js:2886–2920](../../apps/onlyoffice-plugin/src/spreadsheet.js#L2886-L2920): append/delete buttons และไม่มี row controls ใน Correction
- **S06:** [builder-script.ts:134–209](../../apps/server/src/documents/spreadsheets/builder-script.ts#L134-L209): prototype copy, input clearing, one-row behavior, button regeneration
- **S07:** [spreadsheet-document.ts:341–445](../../apps/server/src/operations/spreadsheet-document.ts#L341-L445), [448–529](../../apps/server/src/operations/spreadsheet-document.ts#L448-L529): trusted row operation และ attachment transition
- **S08:** [upload-poc-pending.ts:274–342](../../apps/web/src/features/onlyoffice/upload-poc-pending.ts#L274-L342), [899–925](../../apps/web/src/features/onlyoffice/upload-poc-pending.ts#L899-L925): pending preservation/remapping และ row guards
- **S09:** [attachment-data.ts:23–109](../../apps/server/src/responses/attachment-data.ts#L23-L109), [111–174](../../apps/server/src/responses/attachment-data.ts#L111-L174): canonical file object, slot keys/physical row และ JSON bound
- **S10:** [upload-poc-picker.js:78–79](../../apps/onlyoffice-plugin/src/upload-poc-picker.js#L78-L79), [279–325](../../apps/onlyoffice-plugin/src/upload-poc-picker.js#L279-L325), [345–384](../../apps/onlyoffice-plugin/src/upload-poc-picker.js#L345-L384): candidate/validation/confirmation/close behavior
- **S11:** [upload-poc-pending.ts:147–163](../../apps/web/src/features/onlyoffice/upload-poc-pending.ts#L147-L163): File bytes เป็น host memory ไม่ persist หลัง reload
- **S12:** [ecm/attachments.ts:303–374](../../apps/server/src/ecm/attachments.ts#L303-L374), [418–625](../../apps/server/src/ecm/attachments.ts#L418-L625), [629–835](../../apps/server/src/ecm/attachments.ts#L629-L835): filename/metadata/original reuse/planning/sequential requests/unknown outcomes
- **S13:** [workbook.ts:605–680](../../apps/server/src/documents/spreadsheets/workbook.ts#L605-L680): active rows/requiredness/physical gaps
- **S14:** [native-request.ts:49–92](../../apps/server/src/responses/native-request.ts#L49-L92), [113–208](../../apps/server/src/responses/native-request.ts#L113-L208): request slot budget/file limits/internal-operation restriction
- **S15:** [ecm/identity.ts:33–143](../../apps/server/src/ecm/identity.ts#L33-L143), [240–305](../../apps/server/src/ecm/identity.ts#L240-L305): destination/ownership/history/shared-identity deletion protection
- **S16:** [engine.ts:155–199](../../apps/server/src/documents/spreadsheets/engine.ts#L155-L199): strip/rebuild managed buttons ตาม current targets
- **S17:** [contract.ts:142–160](../../apps/server/src/documents/spreadsheets/contract.ts#L142-L160): attachment incompatible rules
- **S18:** [spreadsheet-fields.ts:38–79](../../apps/server/src/forms/spreadsheet-fields.ts#L38-L79): publication metadata prerequisite; [spreadsheet-authoring.ts:356–370](../../apps/server/src/routes/spreadsheet-authoring.ts#L356-L370): published config edit guard

### Local canonical policy / historical runtime evidence — ไม่ใช่ Production proof

- **P01:** [spec.md:162–180](spec.md#L162-L180): column-level choice, stale mapping, frozen Published config/duplicate
- **P02:** [spec ข้อ 6](spec.md#6-template-mode-upload) และข้อ 7–12: current batch filename/request policy, original reuse, failures, tables, Correction/exports/cleanup; policy ใหม่ยังไม่มี parent/provider verification ในรายงานนี้
- **P03:** [spec.md:266–270](spec.md#L266-L270): legacy preservation/cutover; ไม่ใช่กฎส่ง UUID ของ mode template ใหม่
- **P04:** [CONTEXT.md:61–95](../../CONTEXT.md#L61-L95), [139–165](../../CONTEXT.md#L139-L165): Attachment Field, pending, row identity, public links, Response/Correction lifecycle
- **P05:** [planning: คำชี้แจงผู้ใช้วันที่ 2026-11-17](planning.md#คำชี้แจงและหลักฐานผู้ใช้-วันที่-2026-11-17), [spec ข้อ 9–10](spec.md#9-replacement-identity-และ-protected-destinations): historical overwrite/shared-identity evidence และ bytes versus snapshot; ข้อยกเว้นเดิมที่ยอมส่ง duplicate names unchanged ถูกแทนที่ภายใน batch โดย [ข้อแก้ไขล่าสุด](planning.md#ข้อแก้ไขนโยบายชื่อซ้ำภายใน-batch--2026-11-17)
- **E01:** [acceptance-matrix.md:358–373](acceptance-matrix.md#L358-L373), [table ticket:41–77](issues/05-table-template-attachment-lifecycle.md#L41-L77): prior recorded native/HTTP evidence พร้อม revision qualifications
- **E02:** [acceptance-matrix.md:328–334](acceptance-matrix.md#L328-L334), [371–380](acceptance-matrix.md#L371-L380), [provider research:144–164](provider-contract-research.md#L144-L164): live single-PDF evidence และ remaining provider/human release HOLD

Canonical local documents ข้างต้นไม่มี semantic revision แยก; references คือ Working Tree snapshot ที่อ่านในรอบนี้ สถานะ approved policy ใช้เฉพาะคำชี้แจงผู้ใช้ที่บันทึก ไม่ถือ ticket resolved หรือ automated review เป็น human/provider approval

### Source fingerprints ที่ใช้กับ smoke และข้อสรุป

SHA-256 ของ Working Tree snapshot ที่อ่านจริง **ก่อนข้อแก้ไข batch naming** ไม่ใช่ fingerprint ของ implementation ใหม่:

| File | SHA-256 |
| --- | --- |
| `apps/server/src/documents/spreadsheets/upload-poc-command.js` | `3ca1d27136bcee71f64a50287dd9bbb60b1da4634bc5ee2bdfa5d799746ac2b1` |
| `apps/server/src/documents/spreadsheets/builder-script.ts` | `75014f27ffd7f995417597e855200f75fff717ffecb2407a2245c07b95996bf5` |
| `apps/server/src/operations/spreadsheet-document.ts` | `f432b7efef97132536427933166e64a657ea2f7285763f3af2ca58c99c97dcd2` |
| `apps/server/src/documents/spreadsheets/workbook.ts` | `343ec21f6a5d13eb287876bba2e9a9b6530b6ca903632532345cd03941e08340` |
| `apps/server/src/responses/attachment-data.ts` | `9bf8edee5cbbe6ceb80419e5fa2d2eed18d3278aae37b5b67eb6dfa1b96f09ac` |
| `apps/server/src/responses/native-request.ts` | `dd237d3ece9308a57e3ade2b4c55cd9004ac93c0ce06156ce39ff7de03d03011` |
| `apps/server/src/ecm/attachments.ts` | `f2dd79f97a1f5a9d8cb93674d43a0fc56321215c0e936ee251009621a0d5f8e4` |
| `apps/server/src/ecm/identity.ts` | `992ee3d395dc44b3c188cae361472d8bcc9a5bb393d158fcc4b8c28800dd3e3c` |
| `apps/onlyoffice-plugin/src/spreadsheet.js` | `503715208818553bb6f33ee746bda85aee8de25e7f1d51cc5ef6032db4035372` |
| `apps/web/src/features/onlyoffice/upload-poc-pending.ts` | `e11e2fbdee17069435c7a726e1aaaba79ed10078f5b2e510347d4d1812e8982c` |
| `apps/onlyoffice-plugin/src/upload-poc-picker.js` | `71d640c59ac2a470414615bbb641bb0a734198127dd4f3d0e2e2a620bf376a14` |

ไม่ได้แก้ application, DB/schema, configuration หรือไฟล์ DCM ไม่ได้ commit/push/deploy สร้างเฉพาะรายงานนี้; scaffolds ของ smoke อยู่ในหน่วยความจำ/temporary native runtime ที่ลบแล้ว
