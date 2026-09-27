# رفع الموقع على سيرفر حقيقي — Deployment

دليل عملي: شو جاهز، وشو لازم تعمله إنت قبل ما الموقع يشتغل على دومين حقيقي.

---

## 1) شو بتحتاج (المتطلبات)

| البند | المطلوب | ملاحظات |
| --- | --- | --- |
| سيرفر | VPS بـ 1 GB RAM أو أكثر (Ubuntu 22.04+) | Hetzner / DigitalOcean / Contabo… |
| Node.js | نسخة 20 أو أحدث | مجرّب على Node 24 |
| Python | 3 + Pillow + NumPy | فقط إذا بدك تعيد توليد صور السيارات |
| دومين | اسم نطاق + سجل A يشير لعنوان السيرفر | |
| شهادة SSL | Let's Encrypt عبر certbot | مجانية |
| مساحة القرص | حجم مجلد `public/media` + `public/whatsapp_images` + قاعدة البيانات | حالياً صور الأسطول هي الأكبر |

**مش مطلوب:** قاعدة بيانات خارجية (SQLite داخل ملف)، ولا Redis، ولا خطوة build للواجهة.

---

## 2) خطوات الرفع

```bash
# على السيرفر
sudo apt update && sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx
sudo adduser --system --group --home /srv/luxury luxury

# انسخ المشروع إلى /srv/luxury/app (بدون node_modules)
cd /srv/luxury/app
npm ci --omit=dev
```

### متغيرات البيئة

| المتغير | الافتراضي | لازم تغيّره؟ |
| --- | --- | --- |
| `PORT` | 3000 | لا |
| `DB_PATH` | `./showroom.db` | نعم — حطها خارج مجلد الكود، مثلاً `/srv/luxury/data/showroom.db` |
| `ADMIN_PASSWORD` | `admin123` | **نعم** — تُستعمل فقط عند أول تشغيل لإنشاء حساب المالك |
| `BUSINESS_TIMEZONE` | `Asia/Amman` | حسب بلدك |
| `NODE_ENV` | — | ضعها `production` (تفعّل حدود المعدل rate limits) |

### التشغيل الدائم (systemd)

```ini
# /etc/systemd/system/luxury-motors.service
[Unit]
Description=Luxury Motors
After=network.target

[Service]
Type=simple
User=luxury
WorkingDirectory=/srv/luxury/app
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DB_PATH=/srv/luxury/data/showroom.db
Environment=ADMIN_PASSWORD=ضع-كلمة-قوية-هنا
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /srv/luxury/data && sudo chown luxury:luxury /srv/luxury/data
sudo systemctl enable --now luxury-motors
sudo journalctl -u luxury-motors -f      # مراقبة السجلات
```

بديل: `pm2 start ecosystem.config.cjs` — أو `Dockerfile` الموجود مع volume على `/data`.

### الدومين و HTTPS

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/luxury-motors
sudo nano /etc/nginx/sites-available/luxury-motors     # بدّل yourdomain.com
sudo ln -s /etc/nginx/sites-available/luxury-motors /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable
```

التطبيق مضبوط أصلاً على `trust proxy = loopback`، فبيقرأ عنوان الزائر الحقيقي من Nginx على نفس الجهاز.

---

## 3) قائمة التحقق قبل الإطلاق

- [ ] **غيّر كلمة مرور المالك** من الإعدادات ← الأمان (اللافتة الصفراء بتظل ظاهرة لحين تغييرها).
- [ ] أنشئ حساباً لكل موظف من **الفريق** بدل مشاركة حساب واحد (مالك / مدير / موظف).
- [ ] عبّي **الإعدادات ← بيانات العمل**: الاسم، الهاتف، واتساب، الإيميل، العنوان، الدوام، روابط السوشال.
- [ ] راجع **الأسعار وقواعد الحجز**: العملة، رسوم المطار، أجرة السائق، الخصم الأسبوعي/الشهري، أقل مهلة حجز.
- [ ] راجع أسعار السيارات في **الأسطول**، وأخفِ أي سيارة غير متوفرة.
- [ ] عبّي **الجرد**: رقم اللوحة، العدّاد، موعد الصيانة، انتهاء التأمين والرخصة لكل سيارة.
- [ ] راجع **محتوى الموقع** (الآراء والأسئلة الشائعة) — تقدر تعدّلها أو تخفيها كلها.
- [ ] راجع **أكواد الخصم** واحذف التجريبية منها.
- [ ] إذا بتستخدم n8n: ضع رابط الـ Webhook واضغط "إرسال اختبار".
- [ ] احذف أي حجوزات/بيانات تجريبية قبل الإطلاق.

---

## 4) النسخ الاحتياطي (مهم)

قاعدة البيانات ملف واحد، بس لا تنسخه وهو شغّال بـ `cp` — استخدم أمر SQLite:

```bash
# /etc/cron.daily/luxury-backup
sqlite3 /srv/luxury/data/showroom.db ".backup '/srv/luxury/backups/showroom-$(date +%F).db'"
find /srv/luxury/backups -name 'showroom-*.db' -mtime +30 -delete
```

انسخ كمان مجلد `public/uploads` (صور مرفوعة من لوحة التحكم) واحتفظ بنسخة خارج السيرفر.

---

## 5) أشياء غير موجودة (تحتاج قرار منك)

| الموضوع | الوضع الحالي | البديل إذا بدك |
| --- | --- | --- |
| الدفع الإلكتروني | غير موجود — الدفعات تُسجَّل يدوياً في لوحة التحكم (كاش/فيزا/حوالة) | ربط بوابة دفع (HyperPay / Stripe) يحتاج تطوير إضافي |
| إرسال إيميل تلقائي | غير موجود — الإشعار يصل عبر n8n Webhook | إضافة SMTP أو ربط n8n بالإيميل |
| رسائل SMS / واتساب تلقائية | غير موجود — في زر واتساب يفتح المحادثة يدوياً | WhatsApp Business API عبر n8n |
| تعدد الفروع | غير موجود — أسطول واحد | يحتاج تطوير |
| صور السيارات | جاهزة ومولّدة مسبقاً | `npm run media` لإعادة توليدها (يحتاج Python) |

---

## 6) الصيانة

```bash
npm test                      # 62 اختباراً: التسعير، كل مسارات الـ API، الترحيل، العمليات
npm audit                     # لازم تطلع "found 0 vulnerabilities"
sudo systemctl restart luxury-motors
```

انسخ `package-lock.json` مع المشروع دائماً — هو الي بيثبّت النسخ المرقّعة أمنياً، و`npm ci --omit=dev`
بيركّب منه بالضبط. افحص `npm audit` كل شهر تقريباً، و`npm audit fix` بيحل أي ثغرة جديدة بدون كسر.

عند التحديث: انسخ الملفات الجديدة، `npm ci --omit=dev`، ثم أعد التشغيل. ترحيل قاعدة البيانات
يتم تلقائياً عند الإقلاع (`PRAGMA user_version`)، وبيانات السيارات والحجوزات لا تُمسّ.
