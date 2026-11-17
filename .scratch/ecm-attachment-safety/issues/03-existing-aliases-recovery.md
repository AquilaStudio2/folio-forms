# ตรวจ shared identities เดิมและนโยบายกู้ไฟล์ที่ถูกเขียนทับ

Labels: wayfinder:grilling
Type: grilling
Parent: ../map.md
Assignee:
Blocked by: 01, 02

## Question

ก่อนใช้ชื่อใหม่ จะตรวจพบ shared identities/aliases เดิมและจัดการประวัติที่อาจถูกเขียนทับอย่างไร โดยไม่กล่าวอ้างว่าชื่อใหม่คืน original bytes ที่สูญไปแล้ว?

เป็น HITL policy decision ไม่อนุญาต audit ข้อมูลจริงหรือ migration จากการเปิด ticket นี้

ต้องได้ข้อสรุปจาก [หลักฐาน DCM แยกไฟล์ชื่อเติมเลขและคง original bytes](01-provider-independent-resources.md) และ [ป้องกันชื่อชนกับไฟล์นอก Folio ledger](02-external-filename-collisions.md) ก่อนตัดสิน recovery policy ที่อาศัย identity/namespace guarantees เตรียมคำถามได้ก่อน แต่ยังไม่ resolve ข้าม blockers

## หลักฐานตั้งต้น

- [รายงานตาราง: failure และ cleanup](../../ecm-storage-templates/table-upload-behavior-audit.md#f-batch-failure-และ-cleanup) ระบุว่าคู่ URL/token หลาย attempts อาจอ่าน bytes ปัจจุบันเดียวกัน และ DB rollback ไม่คืน external bytes
- Context ส่งต่อรายงาน local real-HTTP filename-keyed DCM simulation: save แรก A=`[11]`, B=`[22]`; save ถัดมาเปลี่ยนเฉพาะ B เป็น C=`[33]` แล้วดาวน์โหลดสองแถวเป็น `[33]`,`[33]` ส่วน full-row control คง `[11]`,`[33]` เป็น reproduction ใน local controlled provider ไม่ใช่ผล Production และไม่ได้รันซ้ำในงานนี้
- [สเปกชื่อปลายทางไฟล์ใหม่ข้ามรอบบันทึก](../spec.md) ป้องกัน new writes ไม่ใช่การรับรองว่า references เดิม independent หรือ bytes เดิมกู้คืนได้

## ประเด็นสำหรับรอบ grilling

1. ใครอนุมัติ read-only inventory ของ Draft, Submission, Correction, workspace, eligible Operation และ identity aliases ที่ Folio รู้จัก? จะรายงาน unknown external aliases โดยไม่เดาอย่างไร?
2. จะแยก duplicate receipt ที่ทราบว่า share identity, น่าสงสัยว่า overwritten และยืนยัน corruption ด้วยหลักฐานใด? Hash ที่ไม่มีในอดีตต้องเป็น unknown ไม่สร้างย้อนหลังจาก bytes ปัจจุบันแล้วอ้างว่าเป็นอดีต
3. หาก bytes เดิมยังหาได้จากแหล่งที่เจ้าของให้ จะยืนยัน provenance และขออนุมัติ recovery โดยรักษา immutable history อย่างไร? ถ้าไม่มี ให้รายงาน unrecoverable/unknown ไม่ใช้ latest หรือไฟล์จากแถวอื่นแทน
4. ระหว่างตรวจ จะ guard shared identity, cleanup และการใช้งานเดิมอย่างไร? ห้าม rename ทุกไฟล์, ลบ alias หรือแก้ history JSON อัตโนมัติ
5. ผู้ใช้/ผู้ดูแลต้องได้รับข้อความใดเมื่อ URL ยังเปิดได้แต่ integrity ของ historical bytes ไม่ยืนยัน? แยก local known bug จากข้อกล่าวหา Production เสียหาย

## เกณฑ์คำตอบ

- [ ] ขอบเขต inventory และผู้อนุมัติชัดเจน พร้อม classification และ evidence ที่หักล้างได้
- [ ] ระบุ recovery/ไม่มี recovery และ human acceptance รายกลุ่ม โดยไม่สมมติว่ามี backup ใน Folio
- [ ] ระบุ release/data-use decision สำหรับข้อมูลเดิมที่ยังไม่ยืนยัน พร้อม guard และผู้รับผิดชอบ
- [ ] เคารพ public-link/external-history standing constraints ใน parent map ไม่เปิด private archive redesign

## Comments

2026-11-18: ไม่มีการตรวจ Production data ไม่มีการกู้ bytes หรือแก้ history ในงาน charting นี้
