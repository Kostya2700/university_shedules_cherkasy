# 🎓 Schedule Calendar

**Автоматичне управління розкладом університету в Google Calendar**

[![Next.js](https://img.shields.io/badge/Next.js-15.1.3-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success)](https://github.com/)

## ✨ Особливості

- 🔐 **Безпечна авторизація** через Google OAuth 2.0
- 📊 **Розумні фільтри** - рівень освіти та курс
- 📅 **Автоматичне управління** - додавання, видалення, оновлення подій
- 🔗 **Meeting Links** - автоматичне додавання посилань на Zoom/Meet
- 🎨 **Кольорове кодування** - лекція/практика/лабораторна
- ⏰ **Нагадування** - за 10 хвилин до початку
- 📱 **Responsive** - працює на всіх пристроях

## 🚀 Швидкий старт

```bash
# Клонування
git clone <repository-url>
cd schedule-calendar

# Встановлення
npm install

# Налаштування (створіть .env.local)
cp .env.example .env.local
# Заповніть змінні оточення

# Запуск
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000)

## 📚 Документація

| Документ | Опис |
|----------|------|
| [📖 QUICK_START.md](./QUICK_START.md) | Швидкий старт для розробки |
| [⚡ QUICK_DEPLOY.md](./QUICK_DEPLOY.md) | Deploy на Vercel за 5 хвилин |
| [🔧 SETUP.md](./SETUP.md) | Детальне налаштування |
| [🔑 SETUP_GOOGLE_AUTH.md](./SETUP_GOOGLE_AUTH.md) | Google OAuth конфігурація |
| [✅ DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) | Checklist перед deploy |
| [📋 PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) | Повний огляд проекту |
| [🚀 README_PRODUCTION.md](./README_PRODUCTION.md) | Production документація |

## 🏗️ Технології

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Google APIs
- **Auth**: OAuth 2.0 (Google)
- **APIs**: Google Calendar, Google Sheets
- **Deploy**: Vercel

## 📁 Структура

```
schedule-calendar/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main UI
│   │   └── api/                  # API routes
│   ├── lib/                      # Business logic
│   └── types/                    # TypeScript types
├── public/                       # Static files
└── Documentation/                # Docs
```

## 🔧 Налаштування

### 1. Google Cloud Console
1. Створіть новий проект
2. Увімкніть Google Calendar API
3. Увімкніть Google Sheets API
4. Створіть OAuth 2.0 Client ID
5. Додайте redirect URI: `http://localhost:3000/api/auth/google`

### 2. Environment Variables
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google
SPREADSHEET_ID=your_spreadsheet_id
NEXTAUTH_SECRET=your_random_secret
```

### 3. Google Sheets
Структура таблиці:
- Рядок 1-3: Заголовки
- Колонка A: Дати
- Колонка B: Час
- Колонки C+: Розклад груп

## 🚀 Deploy на Vercel

```bash
# 1. Push to GitHub
git push origin main

# 2. Підключіть репозиторій на vercel.com
# 3. Додайте Environment Variables
# 4. Deploy!
```

Детальна інструкція: [QUICK_DEPLOY.md](./QUICK_DEPLOY.md)

## 📸 Screenshots

![Main Interface](docs/screenshot-main.png)
*Головний інтерфейс з фільтрами та управлінням подіями*

## 🤝 Contributing

Pull requests вітаються! Для великих змін спочатку відкрийте issue.

## 📄 Ліцензія

MIT

## 👥 Автори

Розроблено для автоматизації управління розкладом університету

## 💡 Використання

### Додавання подій
1. Увійдіть через Google
2. Оберіть рівень освіти та курс
3. Виберіть аркуш з датою
4. Виберіть групу
5. Натисніть "Додати нові"

### Оновлення розкладу
Натисніть "Оновити" - автоматично видалить старі події та додасть нові

### Видалення подій
Натисніть "Видалити старі" - видалить всі події для обраної групи

## 🐛 Troubleshooting

Дивіться [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) → Troubleshooting

## 📞 Підтримка

- 📖 Документація: Дивіться файли вище
- 🐛 Bug reports: Створіть issue
- 💬 Питання: Discussions

---

**Статус**: ✅ Production Ready | **Версія**: 1.0.0 | **Оновлено**: Січень 2025
