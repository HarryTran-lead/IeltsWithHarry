# Mô hình 3D của Harry (.glb)

Harry góc màn hình có thể chạy bằng một mô hình 3D thật (file `.glb` có khung xương và chuyển động). Nếu chưa có file, hoặc file lỗi, web tự quay về Harry dựng bằng code (`src/components/companion/harry-rig.ts`).

## 1. Ảnh đầu vào

Sticker gốc (`public/ieltswithharry-mascot.webp`) chỉ có nửa người, nên công cụ 3D sẽ dựng ra một bức tượng bán thân. Cần trước một **ảnh toàn thân** cùng phong cách:

- Harry đứng thẳng, nhìn thẳng, hai tay hơi dang (tư thế chữ A), thấy rõ cả giày.
- Nền trắng trơn, không có vòng tròn, không cầm sách (sách sẽ là chuyển động riêng).
- Giữ đúng tóc nâu bồng, mắt nâu to, áo sơ mi trắng tay ngắn, ba lô xanh ngọc, quần xanh navy, giày cam.

Có thể vẽ lại ảnh này bằng công cụ tạo ảnh AI, dùng sticker làm ảnh tham chiếu.

## 2. Dựng mô hình

Dùng Meshy (meshy.ai) hoặc Tripo (tripo3d.ai), mục **Image to 3D**:

- Tải ảnh toàn thân lên. Bật texture, chọn phong cách hoạt hình (cartoon) nếu có.
- Khoảng 20–40 nghìn đa giác là đủ cho nhân vật nhỏ ở góc màn hình.

## 3. Gắn khung xương và chuyển động

Cả Meshy và Tripo đều có **Auto-Rig** cho nhân vật hình người, kèm thư viện chuyển động. Nếu không, dùng Mixamo (mixamo.com): tải FBX lên rồi chọn chuyển động.

Nên có các chuyển động sau. **Tên chuyển động** cần chứa một trong các từ khoá này để web tự gán vào đúng cảm xúc:

| Cảm xúc | Từ khoá trong tên chuyển động |
|---|---|
| Vui vẻ (mặc định) | `Idle` (bắt buộc nên có) |
| Vẫy chào | `Wave`, `Waving` |
| Ăn mừng | `Cheer`, `Victory`, `Jump`, `Dance` |
| Tự hào | `Proud`, `Thumbs Up` |
| Đọc sách | `Reading`, `Book` |
| Đọc báo | `News`, `Phone` |
| Suy nghĩ | `Thinking`, `Scratch` |
| Buồn ngủ | `Sleep`, `Yawn`, `Tired` |
| Lo lắng | `Nervous`, `Worried`, `Sad` |
| Giữ lửa chuỗi | `Fist Pump`, `Excited` |
| Thương thương | `Love`, `Shy`, `Kiss` |

Cảm xúc nào không có chuyển động riêng thì Harry đứng ở chuyển động `Idle`. Biểu tượng của cảm xúc đó vẫn hiện quanh đầu (Zzz, ?, !, tim, lấp lánh).

Nếu mô hình có shape key tên chứa `blink`, Harry sẽ tự chớp mắt. Phần đầu luôn quay nhìn theo con trỏ chuột.

## 4. Xuất file

- Định dạng **GLB**, gộp tất cả chuyển động vào một file.
- **Không** bật nén Draco. Nén Meshopt thì được, ví dụ:
  `npx @gltf-transform/cli optimize harry.glb harry-small.glb --compress meshopt --texture-compress webp --texture-size 1024`
- Nên giữ file dưới khoảng 6 MB.

## 5. Thử và gắn vào web

1. Chạy `npm run dev -- -p 3047`, mở `/preview-companion`.
2. Chọn file ở mục **Thử mô hình .glb**. Trang hiện danh sách chuyển động và cảm xúc nào đang dùng chuyển động nào.
3. Khi đã ưng, chép file vào `public/models/harry.glb` và sửa `src/components/companion/harry-model.ts`:

```ts
export const harryModel: HarryModelConfig | null = {
  url: "/models/harry.glb",
  // Ghim một cảm xúc vào đúng tên chuyển động nếu web đoán sai:
  // clips: { reading: "Sitting Reading" },
  // Nếu mô hình quay lưng hoặc quay ngang: yawOffset: Math.PI,
};
```
