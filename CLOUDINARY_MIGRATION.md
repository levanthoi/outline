# Migration từ AWS S3 sang Cloudinary

## Tổng quan

Outline đã được cập nhật để hỗ trợ Cloudinary như một option lưu trữ file thay thế cho AWS S3. Cloudinary cung cấp:

- **Chi phí thấp hơn**: Miễn phí 25GB storage và 25GB bandwidth/tháng
- **Tối ưu hóa tự động**: Nén và tối ưu hóa hình ảnh tự động
- **CDN toàn cầu**: Phân phối nội dung nhanh trên toàn thế giới
- **API dễ sử dụng**: SDK mạnh mẽ và documentaion chi tiết

## Các bước cài đặt

### 1. Tạo tài khoản Cloudinary

1. Truy cập [cloudinary.com](https://cloudinary.com) và đăng ký tài khoản miễn phí
2. Sau khi đăng ký, truy cập **Dashboard** để lấy thông tin cấu hình:
   - **Cloud Name**
   - **API Key** 
   - **API Secret**

### 2. Cài đặt dependencies

```bash
yarn install
```

Dependencies đã được thêm vào `package.json`:
- `cloudinary`: SDK chính thức của Cloudinary
- `@types/cloudinary`: Type definitions

### 3. Cấu hình Environment Variables

Thêm các biến môi trường sau vào file `.env` của bạn:

```bash
# File Storage Configuration
FILE_STORAGE=cloudinary

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 4. Deploy lên Production

Nếu bạn đang sử dụng Heroku, thêm các environment variables:

```bash
heroku config:set FILE_STORAGE=cloudinary
heroku config:set CLOUDINARY_CLOUD_NAME=your_cloud_name
heroku config:set CLOUDINARY_API_KEY=your_api_key
heroku config:set CLOUDINARY_API_SECRET=your_api_secret
```

## Migration từ S3 sang Cloudinary

### Option 1: Chuyển đổi trực tiếp (Recommended)

1. **Backup data**: Đảm bảo backup toàn bộ dữ liệu hiện tại
2. **Cấu hình Cloudinary**: Thiết lập các environment variables như trên
3. **Deploy**: Deploy ứng dụng với cấu hình mới
4. **Upload lại files**: Các file mới sẽ được upload lên Cloudinary

**Lưu ý**: Files cũ trên S3 vẫn có thể truy cập được thông qua URL cũ cho đến khi bạn quyết định migrate hoàn toàn.

### Option 2: Migration từng bước

```typescript
// Script migration example (tạo file migration.ts)
import { CloudinaryStorage } from "./server/storage/files/CloudinaryStorage";
import { S3Storage } from "./server/storage/files/S3Storage";

async function migrateFiles() {
  const s3Storage = new S3Storage();
  const cloudinaryStorage = new CloudinaryStorage();
  
  // Lấy danh sách files từ database
  const attachments = await Attachment.findAll();
  
  for (const attachment of attachments) {
    try {
      // Download từ S3
      const fileStream = await s3Storage.getFileStream(attachment.key);
      if (!fileStream) continue;
      
      // Upload lên Cloudinary
      const newUrl = await cloudinaryStorage.store({
        body: fileStream,
        key: attachment.key,
        contentType: attachment.contentType,
        acl: "private"
      });
      
      // Update database với URL mới
      await attachment.update({ url: newUrl });
      
      console.log(`Migrated: ${attachment.key}`);
    } catch (error) {
      console.error(`Failed to migrate ${attachment.key}:`, error);
    }
  }
}

// Chạy migration
migrateFiles().then(() => {
  console.log("Migration completed");
}).catch(console.error);
```

## Tính năng và Ưu điểm

### 1. Tối ưu hóa tự động
- Cloudinary tự động nén và tối ưu hóa hình ảnh
- Hỗ trợ WebP, AVIF và các format hiện đại
- Responsive images tự động

### 2. Transformations
```typescript
// Example: Tự động tối ưu hóa hình ảnh
const optimizedUrl = cloudinary.url("sample", {
  fetch_format: "auto",
  quality: "auto"
});
```

### 3. CDN Performance
- Phân phối qua 200+ CDN nodes toàn cầu
- Tự động chọn server gần nhất
- Caching thông minh

## Troubleshooting

### Lỗi thường gặp

1. **Module 'cloudinary' not found**
   ```bash
   yarn install
   # hoặc
   npm install
   ```

2. **Invalid credentials**
   - Kiểm tra lại CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET
   - Đảm bảo không có spaces hoặc ký tự đặc biệt

3. **Upload failed**
   - Kiểm tra quota Cloudinary (25GB limit cho free tier)
   - Verify file size không vượt quá giới hạn

### Monitoring

Theo dõi usage tại [Cloudinary Dashboard](https://cloudinary.com/console):
- Storage usage
- Bandwidth usage  
- API calls
- Transformations

## Chi phí so sánh

### AWS S3
- Storage: $0.023/GB/tháng
- Requests: $0.0004/1000 requests
- Data transfer: $0.09/GB

### Cloudinary (Free tier)
- Storage: 25GB miễn phí
- Bandwidth: 25GB miễn phí/tháng
- Transformations: 25,000/tháng miễn phí

**Kết luận**: Với usage nhỏ đến trung bình, Cloudinary có thể tiết kiệm 80-90% chi phí so với AWS S3.

## Support

Nếu gặp vấn đề trong quá trình migration:

1. Kiểm tra logs trong application
2. Verify cấu hình environment variables
3. Test với file nhỏ trước khi migration toàn bộ
4. Backup data trước khi thực hiện

## Rollback

Để quay lại S3:
```bash
heroku config:set FILE_STORAGE=s3
```

Files trên Cloudinary sẽ vẫn tồn tại và có thể truy cập được thông qua URL.
