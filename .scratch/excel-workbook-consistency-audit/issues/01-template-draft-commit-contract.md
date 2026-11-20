# 01 — ตกลงสัญญา commit และ recovery ของ XLSX Template Draft

Status: resolved  
Type: research  
Priority: P1  
Blocked by: —  
Evidence: [A1–A3](../map.md#1-ต้นเหตุและหลักฐาน)

## ขอบเขต

กำหนดสัญญาของ Admin authoring ก่อนแก้ตั๋ว 05. เปรียบเทียบ working changes ที่อยู่ใน editor จน Save กับ durable pending Operation ที่ผูกกับ opening. ทั้งสองต้องแยก pending state จากกฎ/ไฟล์ที่ canonical readers ใช้. ใช้ transaction เปลี่ยน pointer ไปยัง artifact ที่ validate แล้ว ไม่ทำ distributed transaction. ระบุว่าการกด Apply, Save, Publish, Exit และ Duplicate อ่านหรือเปลี่ยน snapshot ใด โดยไม่ถือ auto-save เป็นหลักฐานว่า atomic

## เกณฑ์รับงาน

- [x] วาด state และ commit point สำหรับ valid base, working change, intentional unbound, stale/unknown, committed และ rollback; ระบุพฤติกรรมหลังปิดหน้า/หมด lease
- [x] เลือกวิธีเก็บ candidate และกำหนด `form + lease + opening + base revision` ที่ต้องตรวจ; อธิบายวิธี reconcile คำขอเดิมโดยไม่ replay เมื่อผลไม่ชัด
- [x] แยก contract-level incomplete Draft ที่เก็บได้จาก broken placement ที่ไม่ควรถูกรับเป็น canonical. กำหนด metadata-only fast path ได้เฉพาะกรณีพิสูจน์ว่า workbook invariant ไม่เปลี่ยน
- [x] ระบุผลของ Save, Publish, discard และ reconnect รวม compatibility กับ drafts เก่าและ rollout ของ plugin/server คนละรุ่น
- [x] ให้เจ้าของระบบตรวจรับสัญญาและ test seam ก่อนเริ่ม 05. ตั๋วนี้ไม่แก้ runtime code

## Comments

- แผนเสนอจาก audit `ba89561`; ยังไม่อนุมัติ implementation
- อนุมัติเริ่มงานและตัดสินใจทางวิศวกรรมตาม [แผน](../spec.md#comments). รวม [สัญญาและ test seams](../draft-commit-contract.md) จาก `79bf7603f8`. เลือก Apply เฉพาะใน editor และ Operation ที่ durable ตอน Save/Publish; policy การเผยแพร่เดิมไม่เปลี่ยน
