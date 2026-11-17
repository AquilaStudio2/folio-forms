# ป้องกันชื่อไฟล์แนบชนข้ามรอบบันทึกด้วยการจองชื่อปลายทางใหม่อย่างถาวร

Status: ready-for-agent

## Problem Statement

User ต้องบันทึกหรือแทนไฟล์แนบบางช่องได้โดยไม่ทำให้ไฟล์ของช่องอื่นเปลี่ยนตาม ทั้งใน scalar Attachment Field และแต่ละแถวของคอลัมน์แนบไฟล์ ผู้ใช้ที่เปิด Draft, Submission หรือ Correction เดิมต้องยังได้ไฟล์ตรงกับรายการที่บันทึก ไม่ใช่เพียงเห็น URL เดิมแต่ดาวน์โหลดได้ bytes ของรายการใหม่

ระบบปัจจุบันจัดเลขชื่อซ้ำเฉพาะ upload plans ภายใน batch เดียว โดยใช้ namespace ร่วมระหว่าง scalar และตาราง จอง natural base filenames ก่อนเติม `-(1)`, `-(2)` และคง original extension/casing วิธีนี้ป้องกันชื่อชนภายในรอบ แต่เริ่มพิจารณาชื่อใหม่ในรอบถัดไป ไม่ได้จองชื่อข้าม Save จึงยังนำชื่อของไฟล์ที่ไม่ได้อยู่ใน upload plans รอบใหม่กลับมาใช้ได้

หลักฐาน reproduction ในสภาพแวดล้อม local ใช้ HTTP จริงและ DCM จำลองที่เก็บไฟล์ตามชื่อ: รอบแรกบันทึกแถว A เป็น bytes `[11]` และ B เป็น `[22]`; รอบสองแทนเฉพาะ B ด้วย `[33]` ระบบนำชื่อฐานของ A กลับมาใช้ ทั้งสอง operations สำเร็จ แต่ดาวน์โหลด A และ B ได้ `[33]` ทั้งคู่ ส่วน control ที่ส่งไฟล์ครบแถวได้ `[11]` และ `[33]` ตามต้องการ นี่เป็นหลักฐานบั๊กของการใช้ชื่อซ้ำกับ provider model นี้ ไม่ใช่ผล Production หรือผลทดสอบ DCM จริง

DCM มี wildcard routing จริงตามข้อมูลที่ผู้ใช้ยืนยันแล้ว ไม่ต้องถามซ้ำว่าจัดโฟลเดอร์ปีและหมวดหมู่ได้หรือไม่ อย่างไรก็ตาม routing ที่ยืนยันไม่ใช่หลักฐานว่าชื่อเติมเลขทุกชื่อให้ resource อิสระ คง casing หรือไม่ชน namespace ของระบบอื่น การแก้ฝั่ง Folio ต้องแยกขอบเขตการรับประกันนี้อย่างชัดเจน

## Solution

สำหรับ storage mode `template` ทุกครั้งที่จำเป็นต้องอัปโหลดไฟล์ใหม่จริง ให้เลือกและจอง destination filename ที่ยังไม่เคยถูกใช้หรือจองใน namespace ของ Folio ก่อนส่ง bytes ไป DCM การจองต้องถาวรและ atomic ข้ามรอบบันทึก ข้าม scalar/คอลัมน์/แถว ข้าม Responses และข้าม requests ที่ใช้ namespace ปลายทางเดียวกัน ไม่อาศัยตำแหน่งแถวหรือ counter ใน memory เพื่อพิสูจน์ความใหม่

ชื่อยังมีฐานจาก `docs_number` และ frozen `template_name` ตามสัญญาเดิม คงนามสกุลและ casing ของไฟล์ต้นฉบับ ใช้เลขต่อท้ายก่อนนามสกุลเมื่อฐานถูกใช้แล้ว โดยไม่แย่งชื่อ literal suffix ของแม่แบบอื่น ไม่แก้ metadata ของ Published Template เพื่อสร้างเวอร์ชัน ไม่เปลี่ยนชื่อไฟล์เก่า และไม่ recycle ชื่อแม้ไฟล์ถูกนำออก ลบ หรือ operation ถูกยกเลิก

ไฟล์ที่ไม่เปลี่ยนยังใช้ canonical reference เดิม ไม่อัปโหลดเพิ่มเพราะกด Save อีกครั้งหรือมีแถวเลื่อน การอัปโหลดที่เกิดจากการเปลี่ยน metadata ตามสัญญาเดิมต้องใช้ชื่อใหม่เช่นเดียวกับ replacement เมื่อ snapshot ใหม่ครบและ commit แล้วจึงพิจารณา cleanup ไฟล์เก่าตาม ownership และ references เดิม ไม่ลดการคุ้มครอง history หรือยกเลิก HOLD ของ unknown outcome

ผลที่ต้องการคือการแทนไฟล์หนึ่งช่องไม่ reuse destination filename ที่ Folio เคยจองหรือใช้ในอีกช่องหรืออีก revision ความอยู่รอดของ bytes ปลายทางจริงยังขึ้นกับ provider ที่แยก resource ของชื่อใหม่ได้ และ namespace ที่ไม่ถูก external writers ชนตาม prerequisites ในแผนความเสี่ยง ไม่อ้างว่า ledger มองเห็นไฟล์ทั้งหมดที่ระบบอื่นสร้างใน DCM

## User Stories

1. As a User, I want การแทนไฟล์เพียงแถว B ไม่เปลี่ยนไฟล์ของแถว A, so that ฉันบันทึกบางแถวได้โดยไม่ทำข้อมูลแถวอื่นเสียหาย
2. As a User, I want ไฟล์ที่อัปโหลดใหม่ได้ชื่อปลายทางใหม่ข้าม Save, so that การบันทึกครั้งถัดไปไม่เขียนทับปลายทางที่เคยใช้แล้ว
3. As a User, I want หลายไฟล์ใน Save เดียวมีชื่อไม่ชนกัน, so that การแก้ข้ามรอบยังรักษาความปลอดภัยภายใน batch เดิม
4. As a User, I want scalar และทุกคอลัมน์แนบไฟล์ใช้การจองชื่อร่วมกัน, so that ไฟล์ไม่ชนเพียงเพราะอยู่คนละชนิดช่องหรือคนละคอลัมน์
5. As a User, I want ไฟล์ของ Response อื่นใน namespace เดียวกันได้รับการคุ้มครองด้วย, so that ชื่อเลขหนังสือและแม่แบบที่เหมือนกันไม่ทำลายข้อมูลผู้อื่น
6. As a User, I want Save ที่ไม่ได้เปลี่ยนไฟล์หรือ metadata ใช้ reference เดิม, so that ระบบไม่อัปโหลดซ้ำโดยไม่จำเป็น
7. As a User, I want เลือกไฟล์อย่างเดียวไม่เริ่มอัปโหลดหรือจองปลายทางถาวร, so that ฉันเปลี่ยนใจใน dialog ได้ตามพฤติกรรมเดิม
8. As a User, I want Cancel หรือปิด dialog คง saved file และ pending state เดิมตามสัญญา, so that การเพิ่มมาตรการชื่อไม่เปลี่ยนความหมายของการยืนยันไฟล์
9. As a User, I want เปลี่ยน `docs_number` แล้วใช้ original bytes ที่ตรวจสอบได้ภายใต้ชื่อใหม่, so that ไฟล์เดิมยังตรงกับเลขหนังสือใหม่โดยไม่เขียนทับปลายทางเดิม
10. As a User, I want เปลี่ยน `docs_number` กลับเป็นค่าที่เคยใช้แล้วยังไม่ reuse ชื่อเก่า, so that การย้อน metadata ไม่ย้อนกลับไปเขียนทับไฟล์เดิม
11. As a User, I want เปลี่ยนเฉพาะ `fiscal_year` ในโหมด template ไม่อัปโหลดใหม่, so that การแก้ชื่อไม่เปลี่ยนสัญญาที่ตกลงไว้แล้ว
12. As a User, I want replacement ที่เปลี่ยนนามสกุลใช้ชื่อใหม่และคง original extension/casing, so that ระบบไม่เปลี่ยนชนิดหรือชื่อส่วนขยายของไฟล์เอง
13. As a User, I want ไฟล์ไม่มีนามสกุลใช้ชื่อปลายทางที่ไม่ชนโดยไม่เติมนามสกุลเอง, so that ไฟล์ยังตรงกับต้นฉบับ
14. As an Admin, I want แม่แบบที่มี literal `-(1)` หรือ suffix อื่นไม่ถูกชื่อที่ระบบสร้างแย่ง, so that ชื่อแม่แบบที่อนุญาตอยู่แล้วยังใช้ได้โดยไม่เกิด alias
15. As an Admin, I want ชื่อฐานและชื่อเติมเลขที่เคยจองได้รับการตรวจร่วมกัน, so that การเปลี่ยนแม่แบบหรือเลขหนังสือไม่หลบการป้องกัน collision
16. As a User, I want การเลื่อนหรือการลบแถวที่รองรับคงชื่อและ receipt ของไฟล์ที่รอด, so that ตำแหน่งใหม่ไม่ทำให้เปลี่ยนเวอร์ชันไฟล์หรืออัปโหลดซ้ำ
17. As a User, I want ลบไฟล์แล้วเพิ่มใหม่ไม่ recycle ปลายทางที่เคยใช้, so that URL เก่าไม่กลายเป็นไฟล์ใหม่โดยการกระทำของ Folio
18. As a User, I want เปิด Draft ที่บันทึกแล้วใหม่ยังดาวน์โหลด bytes เดิมของแต่ละช่องได้, so that ความถูกต้องไม่ขึ้นกับ browser session เดิม
19. As an Admin, I want final Save Correction ใช้ชื่อใหม่สำหรับ actual uploads ภายใต้ frozen contract ของ Submission, so that การแก้ไขไม่เขียนทับประวัติเดิม
20. As a Viewer, I want เปิดและส่งออก revision ที่เลือกแล้วได้ URL และไฟล์ตรงกับ revision นั้น, so that การตรวจผลไม่แสดงไฟล์ replacement ของ revision อื่น
21. As a User, I want Submission และ Corrections เก่าไม่ถูก rename หรือ reupload อัตโนมัติ, so that มาตรการใหม่ไม่เปลี่ยนข้อมูลประวัติของฉัน
22. As an Admin, I want legacy Published Templates ใช้นโยบาย UUID เดิม, so that การแก้โหมด template ไม่เปลี่ยนสัญญาที่เผยแพร่ไปแล้ว
23. As a User, I want การจองชื่อคงอยู่หลัง server restart, so that การเริ่ม process ใหม่ไม่ทำให้ชื่อที่เคยใช้กลับมาว่าง
24. As a User, I want requests พร้อมกันไม่จองชื่อเดียวกันได้สำเร็จทั้งคู่, so that ความปลอดภัยไม่ขึ้นกับลำดับที่ server ประมวลผล
25. As an Admin, I want ทุกช่องใน batch ผ่าน validation และ guards ก่อน external write, so that การจัดชื่อใหม่ไม่เปิดทางให้ข้อมูลหรือสิทธิ์ที่ไม่ถูกต้องไปถึง DCM
26. As a User, I want original ที่อ่านไม่ได้หรือ size/hash ไม่ตรงหยุดก่อนเขียนไฟล์ใหม่, so that ระบบไม่สร้างเวอร์ชันจาก bytes ที่พิสูจน์ไม่ได้
27. As a User, I want การอัปโหลดสำเร็จบางส่วนแต่ snapshot ไม่สำเร็จยังคง saved state เดิม, so that ฉันไม่เห็นคำตอบครึ่งเก่าครึ่งใหม่
28. As an Admin, I want ชื่อของ orphan และ canceled uploads ไม่ถูกนำกลับมาใช้, so that ไฟล์ที่อาจยังอยู่ภายนอกไม่ถูกเขียนทับเพราะ Folio ลืม reservation
29. As a User, I want unknown upload คง HOLD และไม่ส่งซ้ำอัตโนมัติ, so that ชื่อใหม่ไม่กลายเป็นข้ออ้างให้เพิ่ม external effects ที่ยังไม่ทราบผล
30. As an Admin, I want uncertain DELETE ไม่ถูก retry หรือถือว่าสำเร็จเพราะมีชื่อใหม่, so that การแก้ collision ไม่ลดการควบคุมการลบ
31. As a User, I want snapshot ใหม่ commit ครบก่อนเริ่ม cleanup ของไฟล์เก่าที่เข้าเงื่อนไข, so that cleanup ไม่ทำลายข้อมูลที่ยังเป็นคำตอบปัจจุบัน
32. As a User, I want cleanup ล้มเหลวหลัง commit ไม่ย้อนผลบันทึกใหม่, so that ฉันยังเปิดและส่งออกคำตอบที่สำเร็จแล้วได้พร้อมคำเตือนที่ถูกต้อง
33. As an Admin, I want reference ร่วมและ protected history ป้องกัน DELETE ตามเดิม, so that ชื่อใหม่ไม่ทำให้ลบ resource ที่มีผู้ใช้อื่นอ้างอิง
34. As an Admin, I want attempt, destination และ reservation มีหลักฐานเชื่อมกับ operation เดิมอย่างถาวร, so that ตรวจผลหลัง restart หรือ Response deletion ได้โดยไม่เดา
35. As an Admin, I want ตรวจชื่อและ aliases ที่มีอยู่ก่อนเปิดใช้มาตรการ, so that ไม่เริ่ม namespace ใหม่โดยลืมไฟล์เก่าที่ Folio รู้จัก
36. As an Admin, I want ข้อมูลเก่าที่กำกวมหรือ bytes ถูกเขียนทับแล้วแสดงว่าไม่ยืนยันหรือยังเสียหาย, so that ไม่มีรายงานเท็จว่าการเปลี่ยนชื่อกู้ข้อมูลเดิมได้
37. As a User, I want ไฟล์ทุกชนิดรวม 0-byte ที่ผ่านเงื่อนไขเดิมคง bytes แบบตรงตัว, so that ระบบไม่แปลงหรือทำไฟล์หายระหว่างจัดชื่อ
38. As a User, I want errors ระบุช่องและแถวที่เกี่ยวข้องโดยคงไฟล์เดิม, so that แก้ปัญหาได้โดยไม่ต้องเลือกไฟล์ที่บันทึกแล้วใหม่ทั้งหมด
39. As an Admin, I want ผล local HTTP แยกจาก provider และ human acceptance, so that ไม่เปิดใช้ด้วยข้อสรุปที่หลักฐานยังรองรับไม่ถึง
40. As an Admin, I want ยอมรับหลักฐาน wildcard routing ของผู้ใช้โดยไม่ถามซ้ำ, so that การตรวจคงเหลือมุ่งที่ byte independence และขอบเขตชื่อจริง
41. As an Admin, I want ขอบเขต ledger ที่ไม่เห็นไฟล์จากระบบอื่นระบุชัด, so that ไม่เข้าใจผิดว่า reservation ภายใน Folio รับประกันทั้ง DCM
42. As a User, I want internal row/project/workspace saves ไม่สร้าง upload หรือ DELETE เพิ่ม, so that การแก้ชื่อทำงานเฉพาะ explicit save ที่สัญญาเดิมกำหนด

## Implementation Decisions

1. **ขอบเขตนโยบาย:** เปลี่ยนเฉพาะการจัด destination filename สำหรับ actual new uploads ใน storage mode `template` ของ explicit Save Draft, Submit และ final Save Correction นโยบายนี้เสนอแทนการ reset namespace ทุก batch ส่วน legacy UUID contract คงเดิม นี่ยังเป็นสเปก ไม่ใช่พฤติกรรมที่ implement แล้ว
2. **แก้ที่ shared boundary:** ใช้เส้นทางวางแผน upload และ durable attachment ledger เดิมร่วมกันทุก scalar/table plan ไม่เพิ่มกลไกเลือกชื่อแยกตามหน้า คอลัมน์ หรือชนิด operation ไม่เพิ่ม helper, UI, config หรือ dependency หากของเดิมรองรับได้
3. **รูปแบบชื่อ:** รักษาฐานจาก root `docs_number` กับ frozen `template_name` และ original extension/casing ฐานที่ยังไม่เคยถูกใช้หรือจองอาจใช้ได้ครั้งแรก ฐานที่ไม่ว่างต้องหาชื่อเติม `-(n)` ก่อน extension; ไม่มี extension ให้เติมท้าย ห้าม truncate, normalize หรือเขียนชื่อไม่ปลอดภัยใหม่ให้ผ่าน validation
4. **ความหมายของความใหม่:** ชื่อที่เลือกต้องไม่เท่ากับ destination ที่เคยใช้หรือจองไว้ใน namespace เดียวกัน ไม่จำกัดเพียง slots ที่ส่งไฟล์ครั้งนี้หรือ Response ปัจจุบัน การเพิ่ม counter อย่างเดียวโดยไม่ตรวจ destination เต็มไม่เพียงพอ ห้ามใช้ physical row index เป็น identity ของเวอร์ชัน
5. **Natural/literal suffix collision:** กัน natural base filenames ของทุก plan ใน batch ก่อนแจก suffix และตรวจร่วมกับ destination/reservation ในอดีตทุกครั้ง แม่แบบที่ลงท้าย literal `-(1)` หรือ `-(2)` ไม่ทำให้ generated suffix หลบ uniqueness ได้ หาก natural base นั้นเคยถูกใช้แล้วก็ต้องเลือกชื่อใหม่เช่นกัน ไม่รับรองว่า literal base จะได้ชื่อเดิมเสมอข้าม Save
6. **Durable atomic reservation:** จอง destination จริงพร้อมหลักฐาน operation/attempt ใน persistence ก่อน external write ใช้การประสานงานและ enforcement ที่กัน requests พร้อมกันได้จริง ข้าม process และ restart โดย scope ต้องครอบคลุม namespace ของ service-account/provider destination ที่อาจชนกัน ไม่อาศัย in-memory counter หรือ transaction ที่บันทึก reservation หลัง POST เท่านั้น รายละเอียด constraint และวิธีใช้ ledger เดิมเป็นการตัดสินใจ implementation แต่ต้องพิสูจน์คุณสมบัติเหล่านี้ได้ หากต้องเปลี่ยน schema ให้เสนอเฉพาะสิ่งจำเป็น ไม่สร้างระบบทะเบียนซ้ำโดยปริยาย
7. **ไม่ recycle:** ชื่อที่จองแล้วไม่กลับมาว่างเมื่อ upload ล้มเหลว ถูก cancel ไม่ได้ dispatch กลายเป็น orphan ถูก cleanup หรือ Response ถูกลบ ยอมมีเลขข้ามเพื่อรักษาความปลอดภัย การรู้ว่าไฟล์ถูกลบแล้วไม่ใช่เหตุให้นำชื่อเดิมกลับมาใช้
8. **Admission และข้อมูลเดิม:** ก่อนเปิด allocator ใหม่ ต้องสำรวจ known destination, reservations, attempts, identities และ references เดิมเพื่อไม่เริ่มจากศูนย์ ชื่อที่ Folio รู้จักต้องถูกกันไว้ รวมข้อมูลที่ retired แล้วเท่าที่หลักฐานมี เมื่อ history/alias/namespace กำกวมให้คง guard หรือ HOLD ไม่เดาชื่อ ขอบเขตการตรวจและส่วนที่ไม่มีหลักฐานต้องบันทึกอย่างตรวจสอบได้ ไม่มีการอนุมานว่า ledger ครบทุกไฟล์ใน DCM
9. **ไม่กู้ bytes โดยการตั้งชื่อ:** สำรวจ shared aliases และกรณีที่อาจถูก overwrite เดิมแยกจากการกัน collision ใหม่ การเปลี่ยนชื่อไม่คืนต้นฉบับที่ถูกเขียนทับ ไม่สร้าง digest ย้อนหลัง ไม่ย้าย URL ของ history ไปไฟล์ใหม่ และไม่ประกาศว่า repaired หากไม่มี trusted original evidence งานกู้หรือแก้ข้อมูลจริงต้องมีขอบเขตและการอนุญาตแยกต่างหาก
10. **No extra upload:** ไฟล์และ metadata ที่ไม่เปลี่ยนคง reference เดิม ไม่ rename/reupload เพื่อทำเลขให้เรียงสวย การเพิ่ม/ลบ/เลื่อนแถวที่ระบบรองรับไม่ renumber destinations ของผู้รอด Internal row/project/workspace saves และการเลือกไฟล์ใน dialog ไม่เป็นเหตุ dispatch
11. **Metadata และ extension:** การเปลี่ยน root `docs_number` ที่ต้องอัปโหลด original ใหม่ใช้ชื่อใหม่ทุก slot ที่เกี่ยวข้อง รวมการเปลี่ยนกลับเป็นเลขเก่า ต้องอ่าน original จาก trusted committed receipt และตรวจ size/hash ตามสัญญาเดิมก่อน external writes Replacement ใช้ bytes และ extension/casing ของ File ใหม่ การเปลี่ยนเฉพาะปีใน template mode ไม่เพิ่ม upload; legacy ยังคงเงื่อนไข metadata ของตนเอง
12. **Provider contract คงเดิม:** ส่ง original bytes ไป DCM ด้วย template-mode multipart contract เดิม ไม่เพิ่ม UUID ให้ template mode ไม่เปลี่ยน frozen template/category metadata หรือฝังเลขเวอร์ชันในคำตอบแทน destination จริง Ledger ต้องเก็บชื่อที่ส่งจริงและ receipt ที่ได้รับ ไม่ถือว่า token ใหม่หรือ URL ใหม่เพียงอย่างเดียวพิสูจน์ bytes อิสระ
13. **Guards ไม่ลดลง:** คง authorization, owner, lease, revision, row/column binding, canonical receipt, protected history และ unknown-operation guards ก่อน dispatch รวมถึง checks หลัง receipt หาก DCM map ชื่อใหม่ที่แตกต่างกันเป็น resource เดียว Folio อาจทราบ receipt conflict ได้หลัง POST เท่านั้น ให้ HOLD ไม่ commit snapshot ใหม่ ไม่ resend และไม่ DELETE identity ร่วม การตรวจหลัง POST ไม่รับประกันว่า remote original bytes ยังอยู่ เพราะ provider อาจเขียนทับไปแล้ว ห้ามอ้างว่า guard นี้ rollback หรือป้องกันความเสียหายภายนอกที่เกิดก่อนรับ receipt ได้
14. **Outcome และ cleanup:** commit เอกสาร คำตอบ canonical references และ operation เป็น snapshot ใหม่ที่ครบก่อนพิจารณาลบไฟล์เก่า ตรวจ references ทั้ง Draft, immutable history, workspace และ eligible operation ตามเดิม ไม่ DELETE identity ร่วมเพราะ attempt เก่าเลิกใช้งาน Unknown upload หรือ uncertain dispatched DELETE ยัง HOLD ไม่มี automatic POST/DELETE retry ไม่มีสลับชื่อเพื่อส่งใหม่หลังผลไม่แน่นอน
15. **คำเตือนคนละชนิด:** cleanup เก่าที่ล้มเหลวหรือไม่แน่นอนหลัง canonical commit ไม่ undo snapshot ใหม่และไม่ปิดกั้นการอ่าน/ส่งออก เก็บคำเตือนว่า URL เก่าอาจยังใช้ได้และไม่ retry จาก ordinary Save ส่วน canceled batch ที่ผลภายนอกยังไม่ยุติคง blocking ตาม guard เดิม ไม่เอาสองกรณีมารวมเป็น error เดียว
16. **สัญญาผู้ใช้คงเดิม:** หนึ่งไฟล์ต่อ slot, DCM-only originals, JSON shape เดิม, requiredness เดิม, ขนาดรวมศูนย์ของ canonical JSON เดิม และไฟล์ 0–10,000,000 bytes แบบ inclusive ไม่เพิ่ม temporary original storage, per-row Tag, stable row ID หรือ answer JSON column ไม่เปลี่ยน permissions หรือวิธีเลือก revision ในผลลัพธ์
17. **ขอบเขต provider:** คงชื่อและ whitespace ที่ตรึงไว้ ไม่ออกแบบกฎ routing ฝั่ง Folioแทน DCM การจองของ Folio รับประกันได้เฉพาะ namespace/evidence ที่ควบคุม หาก provider normalize suffix/case หรือมี external writers ที่ชนได้ ยังต้องมีข้อตกลง namespace และ acceptance ก่อนอ้างความปลอดภัย end-to-end ไม่แก้ด้วยการเดา normalization rule หรือ live search ว่าไม่พบจึงปลอดภัย

## Testing Decisions

ผู้ใช้อนุมัติ testing seam ในรอบสนทนานี้แล้ว: ใช้ HTTP integration ที่มีอยู่เป็น seam หลัก ทดสอบ application จริงกับฐานข้อมูลและ store แยก พร้อม controlled provider ตรวจ canonical JSON, workbook XLSX ที่บันทึก/ส่งออก และ exact bytes ของไฟล์จริงร่วมกัน ไม่ต้องขออนุมัติ seam ซ้ำ ใช้ native editor และ provider acceptance เฉพาะ boundary ที่ HTTP พิสูจน์ไม่ได้

การทดสอบที่ดีต้องเรียกพฤติกรรมผ่าน HTTP และเปิดผลที่บันทึกจริง ไม่ตรวจเพียงชื่อ helper, ค่า counter, mock call หรือ HTTP 200 ใช้ provider double แบบ filename-keyed ที่แสดง overwrite ได้ เพื่อให้ regression ล้มเหลวกับนโยบาย per-batch เดิม ไม่เปลี่ยน fixture ให้ทุก request สร้าง identity ใหม่จนซ่อนบั๊ก ใช้ test architecture เดิมเป็นหลัก; prior art และหลักฐานเก่าอยู่ใน Further Notes

เกณฑ์ acceptance ของ feature:

1. **Regression หลัก:** Save A=`[11]`, B=`[22]`; Save ถัดไปส่ง replacement เฉพาะ B=`[33]` ตรวจ A ยังดาวน์โหลด `[11]`, B ได้ `[33]` ชื่อใหม่ไม่ reuse A หรือ B เดิม ตรวจ saved JSON และ XLSX ผูก URL ตรง physical row ไม่อาศัย control ที่ส่งทุกแถวแทน partial-save case
2. **หลายรอบ:** แทน A/B สลับกันหลาย Save และเปิด Draft ใหม่ระหว่างรอบ ทุก actual upload ได้ destination ที่ไม่เคยจองก่อน ขณะที่ช่องไม่เปลี่ยนไม่มี POST เพิ่ม ตรวจ bytes ของทุกไฟล์ที่ยังอ้างอิงหลังแต่ละรอบ
3. **Namespace ร่วม:** ชื่อฐานเดียวกันใน scalar, สองคอลัมน์ และหลายแถว ทั้งใน batch เดียวและคนละ request ไม่ชนกัน รวมหลาย Responses ที่ใช้ namespace ปลายทางเดียวกัน เฉพาะคำขอที่ผ่านสิทธิ์และขอบเขตเดิมจึงจัดชื่อใหม่ได้ ห้ามใช้ allocator ทำให้คำขอที่ผิด ownership/history/lease/revision guards ผ่าน
4. **Literal suffix:** เตรียม natural bases ที่ลงท้าย `-(1)` และ `-(2)` พร้อมฐานธรรมดา สร้าง generated suffix ก่อนและหลัง literal เคยใช้งาน ตรวจทุกชื่อเต็มไม่ชนทั้ง batch และ history ไม่ยึด counter เฉพาะ stem เป็น oracle
5. **Metadata:** เปลี่ยน root `docs_number` โดยไม่เลือก replacement ตรวจ original bytes ทุก affected slot ก่อน POST; เปลี่ยนกลับเลขเดิมต้องได้ destination ใหม่ ทดสอบ mixed replacement/original reuse และ year-only change ที่ไม่มี upload ใน template mode
6. **Extension:** ทดสอบ extension เดิม, extension ใหม่, `.PDF` และ `.pdf`, extensionless และชื่อที่มีหลายจุด คง original extension/casing ไม่มีการเติมหรือแปลงเอง Provider-double alias case ที่กำหนดอย่างชัดเจนใช้ตรวจ guards ได้ แต่ไม่ถือเป็นการค้นพบ case semantics ของ DCM จริง
7. **No extra effects:** Save โดยไม่เปลี่ยนไฟล์, เปิดอ่าน, export, internal row/project/workspace save และ cancel การเลือกไฟล์ ไม่ upload หรือ DELETE เพิ่ม นำไฟล์ออกแล้วบันทึกใช้ cleanup ตามเดิม ไม่ทำให้ destination เก่าถูก reuse เมื่อแนบใหม่
8. **Row boundary:** ใช้เฉพาะ append/delete/move transition ที่ระบบรองรับ ตรวจ saved survivors คง token/link/name/bytes แม้ physical index เปลี่ยน ตรวจ empty gaps และหลายคอลัมน์ไม่ย้าย receipt ไปแถวข้างเคียง กรณี native gestures ที่ยังไม่รองรับไม่ถูกประกาศผ่านจากผล HTTP นี้
9. **Restart:** จองหรือใช้ชื่อแล้ว restart application ด้วยฐานข้อมูลเดิม จากนั้น Save ใหม่ต้องไม่เลือกชื่อเก่า รวม restart ก่อน dispatch, หลัง dispatch และก่อน canonical commit ตามจุด fault ที่ควบคุมได้
10. **Race:** สอง requests หรือสอง processes วางแผนฐานเดียวกันพร้อมกันที่ฐานข้อมูลเดียวกัน ต้องไม่ dispatch ชื่อเดียวกันสองครั้ง ทั้งกรณีคนละ Response และกรณีที่ request หนึ่งหมดสิทธิ์หรือ revision stale ยังคงให้ guard เดิมปฏิเสธ request ที่ไม่ชอบธรรม
11. **Reservation retention:** สร้างกรณี reserved-but-not-dispatched, known failure, canceled upload, known orphan, cleanup สำเร็จ และ Response deletion แล้วเริ่ม actual upload ใหม่ ชื่อที่เคยจองไม่ถูก recycle ตรวจผ่าน destination ที่ dispatch และ durable evidence หลัง reopen/restart ไม่บังคับรูปแบบ schema ภายใน
12. **Unknown POST:** จำลอง provider เขียน bytes แล้วไม่คืน receipt ให้ original operation HOLD ไม่มี automatic resend ไม่มีการจัดชื่อใหม่เพื่อหลบ HOLD หลัง restart หรือ ordinary Save และไม่เผยแพร่ partial canonical snapshot
13. **Known failure และ atomic snapshot:** ทำ batch สำเร็จบางไฟล์แล้วอีกไฟล์ล้มเหลว หรือ canonical commit ล้มเหลว Saved JSON/XLSX เดิมยังเป็นชุดเดียวกัน ไม่เปลี่ยนไฟล์เก่าหรือทำ receipt หาย มี durable evidence สำหรับ orphan และไม่ recycle reservation
14. **Pre-write validation:** invalid slot, stale row mapping, ไม่ผ่าน owner/lease/revision, requiredness ไม่ครบ, ชื่อไม่ปลอดภัย และ original size/hash ไม่ตรงต้องไม่เริ่ม external writes ที่ถูกห้าม และคง prior files ตรวจ error ระบุ slot/row ตามสัญญาเดิม
15. **Protected identity:** ใช้ provider double ที่ map ชื่อ request ใหม่ไป resource เดิมและเขียนทับก่อนคืน receipt ตรวจว่า receipt conflict ทำให้ HOLD ไม่ commit ไม่ resend และไม่มี extra DELETE ตรวจ canonical snapshot เดิมไม่ถูกยอมรับแทนด้วย snapshot ใหม่ แต่บันทึกแยกว่าข้อมูลภายนอกอาจถูก overwrite แล้ว ห้ามตั้ง acceptance ว่า post-POST detection ทำให้ original remote bytes รอด กรณีนี้เป็น provider-independence prerequisite ที่ allocator แก้เองไม่ได้
16. **Postcommit cleanup:** provider DELETE ของไฟล์เก่าล้มเหลวหรือผลไม่แน่นอนหลัง snapshot ใหม่ commit ตรวจ snapshot ใหม่อ่าน/ส่งออกและดาวน์โหลด bytes ใหม่ได้ คำเตือนคงอยู่หลัง reload Ordinary Save ไม่ retry DELETE ส่วน uncertain canceled batch ยังคงบล็อก mutation ตามกติกาเดิม
17. **History:** Save Draft, Submit, final Save Correction และ Correction ถัดไปที่มี actual upload ใช้ชื่อใหม่ เปิด original Submission และแต่ละ Correction ที่เลือก ตรวจ JSON, XLSX URL และ exact bytes ของ revision นั้นไม่กลายเป็น replacement ใหม่ ไม่มี reupload/rename history เพื่อทำให้ test ผ่าน
18. **Legacy และ old-data boundary:** seed legacy UUID contract กับ template-mode historical destinations/shared aliases ก่อนเปิด feature ตรวจ legacy ไม่เปลี่ยนนโยบาย Known destinations ถูกกันไว้ ข้อมูลกำกวมไม่ถูก backfill เป็นความแน่นอน ไม่สร้าง digest หรือรายงานว่ากู้ bytes แล้วเพียงเพราะสร้างชื่อใหม่
19. **ไฟล์และ limits:** ตรวจ original bytes แบบตรงตัวและ SHA-256 เมื่อใช้เป็นหลักฐานตามสัญญาเดิม ครอบคลุม 0, 1 และ 10,000,000 bytes; 10,000,001 bytes ถูกปฏิเสธก่อน dispatch รวมไฟล์ binary, HTML, encrypted/password-protected และ extensionless โดยไม่ decrypt/preview/แปลงชนิด คง canonical JSON limit และ required attachment behavior เดิม
20. **Native boundary:** ภายหลัง implementation ตรวจ actual partial replacement, reopen และ selected-revision XLSX ด้วย ONLYOFFICE ใน boundary ที่ controlled HTTP fixture ไม่ครอบคลุม ไม่ขยายผลเป็นการรับรองทุก sort/drag/paste/Undo/Redo/filter/hidden/merge/multi-tab combination
21. **Provider boundary:** ต้องมี evidence ที่ได้รับอนุญาตแยกต่างหากว่าชื่อเติมเลขหลายรอบยัง routing ตามที่ต้องการ และไฟล์แต่ละชื่อดาวน์โหลด exact bytes อิสระ ไม่สูญเสีย suffix/case หรือ alias จาก normalization รวม namespace ที่มี external writers การทดสอบ local ไม่ทดแทนหลักฐานนี้ และสเปกนี้ไม่อนุญาต live calls ใหม่

รายการข้างต้นเป็นเกณฑ์ทดสอบที่ต้องทำหลังได้รับอนุญาต implementation ไม่ใช่รายงานว่าได้รันหรือผ่านแล้วในงานเอกสารนี้

## Out of Scope

- ไม่ implement application, แก้ schema/migration, เปลี่ยนฐานข้อมูล, เรียก live DCM, push หรือ deploy จากสเปกนี้
- ไม่สร้าง upload page, แก้ popup, เพิ่ม progress UI หรือสร้างระบบ temporary original storage เพื่อให้ pending File อยู่รอดหลัง refresh
- ไม่เพิ่ม stable row identity หรือรับรอง native sort/drag/copy/paste/Undo/Redo/insert/delete/filter/hidden/merge และ multi-tab combinations ทุกชนิด ไม่แก้ข้อขัดแย้ง last-row builder/server ในงาน allocator นี้
- ไม่ออกแบบ unknown-request settlement contract ใหม่ ไม่เพิ่ม manual unlock, automatic retry หรือสลับชื่อหลังผลไม่แน่นอน
- ไม่เปิดคำตัดสินเดิมเรื่อง DCM-only, category-ID grouping, same-identity no-extra-DELETE หรือ wildcard routing ให้ถามใหม่
- ไม่เปลี่ยน public-link model ที่ยอมรับแล้ว ไม่สัญญาว่า external history immutable และไม่รับประกัน DCM ทั้ง namespace จาก ledger ของ Folio เพียงอย่างเดียว
- ไม่ rename/reupload ไฟล์เก่าทั้งหมด ไม่ย้าย history ไม่ restore bytes ที่ overwrite แล้ว และไม่ทำ remediation ข้อมูลจริงโดยไม่มีขอบเขตและ authorization แยก
- ไม่แก้ legacy UUID policy, publication prerequisites, Field/filter semantics, PDMS Project Name Source หรือ selected-revision download contract
- ไม่รับรอง provider ทุกชนิดไฟล์ ทุกขนาด และ capacity ด้วยผล local tests หรือผล live PDF ตัวอย่างเดียว ความเสี่ยงส่วนที่ไม่ใช่ naming fix ให้ติดตามใน risk map

## Further Notes

**สถานะการวางแผน:** `ready-for-agent` เป็น triage label ของ local Markdown tracker หมายถึงสเปกนี้พร้อมใช้เป็นขอบเขตงาน ไม่ใช่ permission ให้เริ่ม implementation และไม่ใช่ release/human/provider acceptance ผู้ใช้สั่ง documentation-only หลัง commit งานเดิมตามบันทึกส่งมอบเป็น `67409b5` บน `feat/ecm-storage-templates` งานนี้สร้างสเปกเท่านั้น ไม่แก้เอกสารเดิมเพื่อทำให้ข้อเสนอใหม่ดูเหมือนพฤติกรรมที่ผ่านแล้ว

**ขอบเขตหลักฐาน ณ 2026-11-18:** แยก current source ที่อ่าน, historical test results, user-reported runtime evidence และข้อเสนอในสเปกนี้ออกจากกัน ไม่มี deployed artifact หรือผล Production ที่ตรวจในงานนี้

- **Current Source — supported เฉพาะ per-batch allocation:** [numberDuplicateAttachmentFilenames](../../apps/server/src/ecm/attachments.ts#L549-L575) สร้างชุด natural destinations และ suffix map จาก plans ที่รับเข้าเท่านั้น; [planAttachmentUploads](../../apps/server/src/ecm/attachments.ts#L585-L654) เรียก allocator กับ actual plans ของ request นั้น Source ที่อ่านผ่าน CodeGraph ในรอบเอกสารนี้สนับสนุนว่าเป็น per-batch ไม่ใช่หลักฐานว่า cross-save reservation implement แล้ว Baseline commit ตามบันทึกส่งมอบคือ `67409b5`; ไม่ได้ตรวจ deployed revision
- **Local regression — supported สำหรับ controlled model:** ผล A=`[11]`, B=`[22]` แล้วแทนเฉพาะ B=`[33]` และ control `[11],[33]` เป็น reproduction ที่ส่งมอบมากับโจทย์ ใช้ HTTP จริงกับ filename-keyed DCM simulation ไม่รันซ้ำในงานนี้ Temporary reproduction ถูกนำออกแล้ว ไม่มี permanent test artifact ของ reproduction นี้ให้ใช้อ้างว่ารันใหม่ จึงต้องเพิ่ม regression ที่ seam เดิมเมื่อ implement
- **Historical BATCH — supported local, ไม่ใช่ cross-save proof:** [BATCH evidence](../ecm-storage-templates/acceptance-matrix.md#batch-filename-verification) บันทึก scalar/table HTTP 143/143 และ standalone real-listener/native-Builder smoke ของนโยบายใน batch Baseline ที่เอกสารบันทึกคือ `0a12d91a5b72d4470ae9ceed1c3d4845d2103ced` พร้อม Working Tree/source hashes ของรอบนั้น ไม่ relabel เป็นผล feature ใหม่นี้ และไม่เรียกผลเก่าว่ารันใหม่
- **User-reported DCM routing — accepted สำหรับกรณีที่แจ้ง:** [หลักฐานผู้ใช้เพิ่มเติม](../ecm-storage-templates/planning.md#หลักฐานผู้ใช้เพิ่มเติมหลังการประเมินความเสี่ยงตาราง) ระบุ exact patterns `กทอ.68* ก่อหนี้-8 *`, `กทอ.67* ขอเบิก2 *`; ตัวอย่างก่อนหน้าคือ `กทอ.67*ก่อหนี้-4*` เข้าปี 2567 และหมวด `2. มติและการก่อหนี้` คง whitespace ตามต้นฉบับ ไม่อนุมาน full folder path หรือ provider implementation ไม่เปิดคำถามว่ามี wildcard routing จริงหรือไม่ซ้ำ
- **Provider guarantees — unverified / HOLD:** routing ที่ผู้ใช้ยืนยันยังไม่พิสูจน์ suffix/case preservation, independent bytes/identities ข้าม Save, external namespace safety หรือ settlement ของ unknown requests ไม่มี live DCM calls ใหม่หรือหลักฐานยืนยันหัวข้อเหล่านี้จากงานเอกสารนี้
- **Existing policy — แยกจากข้อเสนอใหม่:** [ข้อแก้ไขชื่อซ้ำใน batch](../ecm-storage-templates/planning.md#ข้อแก้ไขนโยบายชื่อซ้ำภายใน-batch--2026-11-17) ระบุ counter reset ทุก batch และไม่จองข้าม Save อย่างชัดเจน สเปกนี้เสนอเปลี่ยนเฉพาะข้อจำกัดนั้นและ retention ที่จำเป็น ไม่อ้างว่า old feature spec อนุมัติ cross-save design แล้ว
- **Testing prior art:** [existing scalar HTTP integration](../../apps/server/test/http/ecm-scalar-save-submit.test.ts) และ [acceptance matrix](../ecm-storage-templates/acceptance-matrix.md) เป็นแนวทางใช้ application, isolated persistence และ controlled provider ไม่สร้าง seam ใหม่โดยไม่มีเหตุ ผู้ใช้อนุมัติ HTTP seam พร้อมการตรวจ saved JSON/XLSX/exact bytes แล้วในรอบสนทนานี้
- **Vocabulary และ ADR:** ใช้ [CONTEXT](../../CONTEXT.md) สำหรับ User, Admin, Viewer, Attachment Field, Draft, Submission, Correction, Upload Attempt และ Provider File Identity; คง [ADR 0003](../../docs/adr/0003-pdms-project-name-choices.md) เรื่อง saved project-name answers และ [ADR 0004](../../docs/adr/0004-results-filters-use-scalar-field-tags.md) เรื่อง root scalar filter Tags ไม่ตีความ `fiscal_year` filter เป็น attachment prerequisite ใหม่
- **Snapshot เก่าและความเสี่ยงทั้งหมด:** [table upload audit](../ecm-storage-templates/table-upload-behavior-audit.md) มี 64 กรณีและ source/native evidence ของแต่ละช่วง revision โดย snapshot หลักวันที่ 2026-11-17 อ้าง HEAD `0a12d91a5b72d4470ae9ceed1c3d4845d2103ced` พร้อมงาน Working Tree และ amendment ของ BATCH ต้องอ่านตามข้อจำกัดนั้น ไม่ใช่ acceptance ของ allocator ข้าม Save

**Remaining decisions:** ดู [แผนความเสี่ยงและ child decisions](map.md) สำหรับ provider identities/namespace, old-data audit และ remediation, native table boundaries, last-row contradiction, settlement/cleanup, browser File lifetime, public-link/external-history exposure และ provider type/size/capacity หลักฐานเหล่านี้ไม่ถูกปิดด้วยชื่อใหม่หรือสถานะ `ready-for-agent` ของสเปกนี้
