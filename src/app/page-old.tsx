'use client';

import { useState, useEffect } from 'react';
import { Calendar, Trash2, RefreshCw, LogIn, LogOut } from 'lucide-react';

interface Sheet {
  id: number;
  title: string;
}

interface ScheduleEvent {
  subject: string;
  type: string;
  location: string;
  startDateTime: string;
  dayOfWeek: string;
  teacherName?: string;
  meetingLink?: string;
}

export default function Home() {
  const [step, setStep] = useState<'login' | 'select' | 'manage'>('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [groupCell, setGroupCell] = useState('AK');
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const SPREADSHEET_ID = '1wWXwGs_xTwQY2jimE7iXYD5RLy8WrYiJHQlMke5afvY';

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/sheets/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: SPREADSHEET_ID }),
        });
        
        if (response.ok) {
          setIsAuthenticated(true);
          setStep('select');
          const data = await response.json();
          setSheets(data.sheets);
        }
      } catch (error) {
        console.error('Not authenticated');
      }
    };

    checkAuth();
  }, []);

  const handleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleLogout = () => {
    document.cookie = 'google_tokens=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    setIsAuthenticated(false);
    setStep('login');
    setSheets([]);
    setSelectedSheet(null);
    setEvents([]);
  };

  const handleSelectSheet = async (sheet: Sheet) => {
    setSelectedSheet(sheet);
    setLoading(true);
    setMessage('Завантаження розкладу...');

    try {
      const response = await fetch('/api/schedule/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: SPREADSHEET_ID,
          sheetName: sheet.title,
          groupCell: groupCell,
        }),
      });

      if (!response.ok) throw new Error('Failed to parse schedule');

      const data = await response.json();
      setEvents(data.events);
      setStep('manage');
      setMessage(`Знайдено ${data.count} занять`);
    } catch (error) {
      setMessage('Помилка при завантаженні розкладу');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOld = async () => {
    if (!selectedSheet || events.length === 0) return;

    setLoading(true);
    setMessage('Видалення старих подій...');

    try {
      const startDate = new Date(events[0].startDateTime);
      const endDate = new Date(events[events.length - 1].startDateTime);
      endDate.setDate(endDate.getDate() + 7);

      const response = await fetch('/api/calendar/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      });

      if (!response.ok) throw new Error('Failed to delete events');

      const data = await response.json();
      setMessage(`Видалено ${data.deleted} подій`);
    } catch (error) {
      setMessage('Помилка при видаленні подій');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = async () => {
    if (events.length === 0) return;

    setLoading(true);
    setMessage('Додавання нових подій...');

    try {
      const response = await fetch('/api/calendar/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) throw new Error('Failed to add events');

      const data = await response.json();
      setMessage(`Додано ${data.success} подій`);
    } catch (error) {
      setMessage('Помилка при додаванні подій');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    await handleDeleteOld();
    setTimeout(async () => {
      await handleAddNew();
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-900 mb-2">
            📅 Розклад → Google Calendar
          </h1>
          <p className="text-gray-600">
            Синхронізація розкладу занять з Google Sheets
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {step === 'login' && (
            <div className="text-center py-12">
              <Calendar className="w-24 h-24 mx-auto mb-6 text-indigo-600" />
              <h2 className="text-2xl font-bold mb-4">Авторизація</h2>
              <p className="text-gray-600 mb-8">
                Увійдіть через Google для доступу до календаря та таблиць
              </p>
              <button
                onClick={handleLogin}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                <LogIn className="w-5 h-5" />
                Увійти через Google
              </button>
            </div>
          )}

          {step === 'select' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Оберіть розклад</h2>
                <button
                  onClick={handleLogout}
                  className="text-gray-600 hover:text-red-600 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Колонка групи (наприклад: AK для СПГ-31)
                </label>
                <input
                  type="text"
                  value={groupCell}
                  onChange={(e) => setGroupCell(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="AK"
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {sheets
                  .filter((sheet) => sheet.title.includes('2026'))
                  .sort((a, b) => b.title.localeCompare(a.title))
                  .map((sheet) => (
                    <button
                      key={sheet.id}
                      onClick={() => handleSelectSheet(sheet)}
                      disabled={loading}
                      className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-colors disabled:opacity-50"
                    >
                      {sheet.title}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {step === 'manage' && selectedSheet && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold">{selectedSheet.title}</h2>
                  <p className="text-gray-600">Група: {groupCell}</p>
                </div>
                <button
                  onClick={() => setStep('select')}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Змінити
                </button>
              </div>

              <div className="bg-indigo-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-700">
                  📊 Знайдено: <strong>{events.length}</strong> занять
                </p>
                <p className="text-sm text-gray-700">
                  🔗 З посиланнями:{' '}
                  <strong>{events.filter((e) => e.meetingLink).length}</strong>
                </p>
              </div>

              {events.length > 0 && (
                <div className="mb-6 space-y-2 max-h-64 overflow-y-auto">
                  <h3 className="font-semibold mb-2">Перші заняття:</h3>
                  {events.slice(0, 5).map((event, i) => (
                    <div key={i} className="bg-gray-50 p-3 rounded-lg text-sm">
                      <div className="font-medium">
                        {event.meetingLink && '🔗 '}
                        {event.subject.split('\n')[0]}
                      </div>
                      <div className="text-gray-600">
                        📅 {new Date(event.startDateTime).toLocaleString('uk-UA')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  onClick={handleDeleteOld}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-5 h-5" />
                  Видалити старі
                </button>

                <button
                  onClick={handleAddNew}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Calendar className="w-5 h-5" />
                  Додати нові
                </button>

                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-5 h-5" />
                  Оновити
                </button>
              </div>

              {message && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-blue-800">{message}</p>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="mt-4 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}
        </div>

        <footer className="text-center mt-8 text-gray-600 text-sm">
          <p>Черкаська філія Європейського університету</p>
        </footer>
      </div>
    </div>
  );
}
