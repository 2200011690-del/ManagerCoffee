FROM node:18-alpine

# Cài đặt thư viện cần thiết cho prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Sao chép file cấu hình
COPY package*.json ./

# Cài đặt dependencies (chỉ production)
RUN npm ci --only=production

# Sao chép mã nguồn và prisma
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Port mà ứng dụng lắng nghe
EXPOSE 10000

# Khởi chạy server
CMD ["npm", "start"]
