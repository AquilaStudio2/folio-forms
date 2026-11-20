# 11 — แยกผล Folio commit ออกจากผลจริงของ DCM

Status: needs-info  
Type: research  
Priority: P1 ด้านข้อมูล  
Blocked by: หลักฐานที่ผูกกับคำขอเดิมและสิทธิ์ที่เจาะจง หากต้องตรวจภายนอก  
Evidence: [R7](../map.md#3-ปัญหาและความเสี่ยงอื่น-แยกจาก-a1a3), [ผล sandbox และ owner disposition](../../ecm-attachment-safety-implementation/acceptance-report.md#independent-folio-verification-under-ambiguous-provider-failures)

## ขอบเขต

ทำ evidence matrix แยก Folio canonical commit, provider write, identity/alias, byte integrity และ settlement. ใช้ loopback ทวน no-resend/retained-history guard หาก implementation รอบนี้แตะ dispatch หรือ commit. HTTP 500 เดิมที่ owner ปิดติดตาม **ไม่เปิดซ้ำ** เว้นแต่มีหลักฐานใหม่ผูกกับ original request. ไม่เปลี่ยนตั๋ว ECM เดิมหรือเสนอ filename workaround เพื่อหลบ guard

## เกณฑ์รับงาน

- [ ] ระบุสิ่งที่ sandbox พิสูจน์และสิ่งที่ไม่พิสูจน์: fail-before-write, fail-after-write, connection drop และ overwrite; Folio rollback ไม่คืน bytes ของ provider
- [ ] การยืนยันจริงต้องมี original request/paired receipt และ provenance ที่ตรวจได้; ยืนยัน bytes ด้วย SHA-256 ของต้นฉบับเทียบ read-back ที่อนุญาต ไม่ใช้ `200`, elapsed time หรือ empty search เป็น settlement
- [ ] ไม่ resend/DELETE, ไม่เรียก DCM, ไม่แตะบัญชี/ฟอร์มจริงโดยไม่มีสิทธิ์แยก. หากไม่มีหลักฐานให้ระบุ unknown และเหตุที่ยังปิดช่องนี้ไม่ได้ โดยไม่บล็อก local integration 12

## Comments

- ตั๋วนี้จัดทำขอบเขตหลักฐาน ไม่ใช่คำสั่งรัน Production และไม่เรียกร้องให้เปิดการสืบสวน HTTP 500 เดิมใหม่
