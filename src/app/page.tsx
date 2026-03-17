'use client';

import { useState, useEffect } from 'react';

interface Sheet {
  id: number;
  title: string;
}

interface Group {
  cell: string;
  name: string;
}

interface CalendarResult {
  success: Array<{ event: string; link: string }>;
  errors: Array<{ event: string; error: string }>;
}

function getTwoWeeksRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  // Start of previous week (Monday)
  const prevMonday = new Date(now);
  prevMonday.setHours(0, 0, 0, 0);
  prevMonday.setDate(now.getDate() + diffToMonday - 7);

  // End of current week (Sunday)
  const currentSunday = new Date(now);
  currentSunday.setHours(23, 59, 59, 999);
  currentSunday.setDate(now.getDate() + diffToMonday + 6);

  return { start: prevMonday, end: currentSunday };
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<CalendarResult | null>(null);

  // Filters
  const [level, setLevel] = useState<string>('бакалавр');
  const [course, setCourse] = useState<string>('3');
  const [loadingSheets, setLoadingSheets] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadSheets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, course, isAuthenticated]);

  useEffect(() => {
    if (selectedSheet) {
      loadGroups();
    } else {
      setGroups([]);
      setSelectedGroup('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSheet]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/sheets/list');
      if (res.ok) {
        setIsAuthenticated(true);
        // Load sheets after auth
        loadSheets();
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSheets = async () => {
    setLoadingSheets(true);
    setSheets([]);
    setSelectedSheet('');
    try {
      const res = await fetch(`/api/sheets/list?level=${encodeURIComponent(level)}&course=${course}`);
      if (res.ok) {
        const data = await res.json();
        setSheets(data.sheets || []);
      }
    } catch (error) {
      console.error('Error loading sheets:', error);
    } finally {
      setLoadingSheets(false);
    }
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    setGroups([]);
    setSelectedGroup('');
    try {
      const res = await fetch('/api/sheets/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId: parseInt(selectedSheet) }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleDeleteOld = async () => {
    if (!selectedSheet || !selectedGroup) {
      setMessage('❌ Оберіть аркуш та групу');
      return;
    }

    setProcessing(true);
    setMessage('🗑️ Видалення подій за обидва тижні...');
    setResult(null);

    try {
      const res = await fetch('/api/calendar/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sheetId: parseInt(selectedSheet),
          groupCell: selectedGroup,
          deleteBothWeeks: true,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(`✅ Видалено ${data.deleted} подій`);
        if (data.errors > 0) {
          setMessage(prev => `${prev} (${data.errors} помилок)`);
        }
      } else {
        setMessage(`❌ Помилка: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleAddNew = async () => {
    if (!selectedSheet || !selectedGroup) {
      setMessage('❌ Оберіть аркуш та групу');
      return;
    }

    setProcessing(true);
    setMessage('➕ Додавання нових подій...');
    setResult(null);

    const weekRange = getTwoWeeksRange();

    try {
      const res = await fetch('/api/calendar/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetId: parseInt(selectedSheet),
          groupCell: selectedGroup,
          weekStart: weekRange.start.toISOString(),
          weekEnd: weekRange.end.toISOString(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
        setMessage(`✅ Додано ${data.success.length} подій`);
        if (data.errors.length > 0) {
          setMessage(prev => `${prev} (${data.errors.length} помилок)`);
        }
      } else {
        setMessage(`❌ Помилка: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedSheet || !selectedGroup) {
      setMessage('❌ Оберіть аркуш та групу');
      return;
    }

    setProcessing(true);
    setMessage('🔄 Оновлення розкладу...');
    setResult(null);

    const weekRange = getTwoWeeksRange();

    try {
      // Step 1: Delete events for BOTH weeks (previous + current)
      setMessage('🗑️ Видалення подій за минулий та поточний тижні...');
      const deleteRes = await fetch('/api/calendar/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sheetId: parseInt(selectedSheet),
          groupCell: selectedGroup,
          deleteBothWeeks: true,
        }),
      });

      const deleteData = await deleteRes.json();

      if (!deleteRes.ok) {
        setMessage(`❌ Помилка видалення: ${deleteData.error}`);
        setProcessing(false);
        return;
      }

      // Step 2: Add events for both weeks
      setMessage(`✅ Видалено ${deleteData.deleted} подій. ➕ Додавання подій за обидва тижні...`);
      const addRes = await fetch('/api/calendar/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetId: parseInt(selectedSheet),
          groupCell: selectedGroup,
          weekStart: weekRange.start.toISOString(),
          weekEnd: weekRange.end.toISOString(),
        }),
      });

      const addData = await addRes.json();

      if (addRes.ok) {
        setResult(addData);
        setMessage(
          `✅ Розклад оновлено! Видалено: ${deleteData.deleted}, Додано: ${addData.success.length}`
        );
        if (addData.errors.length > 0) {
          setMessage(prev => `${prev} (${addData.errors.length} помилок додавання)`);
        }
      } else {
        setMessage(`❌ Помилка додавання: ${addData.error}`);
      }
    } catch (error) {
      setMessage(`❌ Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Завантаження...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Розклад Календар</h1>
            <p className="text-gray-600">Управління розкладом занять в Google Calendar</p>
          </div>

          <button
            onClick={handleLogin}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition duration-200 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Увійти через Google
          </button>

          <p className="mt-4 text-sm text-gray-500">
            Необхідні дозволи: Google Calendar та Google Sheets
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
            <h1 className="text-3xl font-bold mb-2">📅 Управління Розкладом</h1>
            <p className="text-indigo-100">Додавайте та видаляйте події в Google Calendar</p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Filters */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border-2 border-indigo-200">
              <h3 className="text-sm font-bold text-gray-700 mb-3">🔍 Фільтри</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Level Filter */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Рівень освіти
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full px-4 py-2 bg-white text-gray-900 font-medium border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm hover:border-gray-400 cursor-pointer"
                    disabled={processing || loadingSheets}
                  >
                    <option value="бакалавр">🎓 Бакалавр</option>
                    <option value="магістр">🎓 Магістр</option>
                  </select>
                </div>

                {/* Course Filter */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Курс
                  </label>
                  <select
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="w-full px-4 py-2 bg-white text-gray-900 font-medium border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm hover:border-gray-400 cursor-pointer"
                    disabled={processing || loadingSheets}
                  >
                    <option value="1">1 курс</option>
                    <option value="2">2 курс</option>
                    <option value="3">3 курс</option>
                    <option value="4">4 курс</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sheet Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Оберіть аркуш з розкладом (містить дату)
              </label>
              {loadingSheets ? (
                <div className="flex items-center justify-center py-3 text-gray-500">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
                  Завантаження аркушів...
                </div>
              ) : (
                <select
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  className="w-full px-4 py-3 bg-white text-gray-900 font-medium text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm hover:border-gray-400 cursor-pointer"
                  disabled={processing}
                >
                  <option value="" className="text-gray-400">
                    {sheets.length === 0 ? 'Немає аркушів для вибраних фільтрів' : '-- Оберіть аркуш --'}
                  </option>
                  {sheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id} className="text-gray-900 font-medium">
                      {sheet.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Group Selection */}
            {selectedSheet && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Оберіть групу
                </label>
                {loadingGroups ? (
                  <div className="flex items-center justify-center py-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2 text-gray-600">Завантаження груп...</span>
                  </div>
                ) : (
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full px-4 py-3 bg-white text-gray-900 font-semibold text-lg border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm hover:border-gray-400 cursor-pointer"
                    disabled={processing}
                  >
                    <option value="" className="text-gray-400 font-normal">-- Оберіть групу --</option>
                    {groups.map((group) => (
                      <option key={group.cell} value={group.cell} className="text-gray-900 font-bold text-xl">
                        {group.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={handleDeleteOld}
                disabled={processing || !selectedSheet || !selectedGroup}
                className="bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-semibold py-4 px-6 rounded-lg shadow-lg transition duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Видалити старі
              </button>

              <button
                onClick={handleAddNew}
                disabled={processing || !selectedSheet || !selectedGroup}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold py-4 px-6 rounded-lg shadow-lg transition duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Додати нові
              </button>

              <button
                onClick={handleUpdate}
                disabled={processing || !selectedSheet || !selectedGroup}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-4 px-6 rounded-lg shadow-lg transition duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Оновити
              </button>
            </div>

            {/* Message */}
            {message && (
              <div className={`p-4 rounded-lg ${
                message.includes('✅') ? 'bg-green-50 border-2 border-green-200' :
                message.includes('❌') ? 'bg-red-50 border-2 border-red-200' :
                'bg-blue-50 border-2 border-blue-200'
              }`}>
                <p className="text-sm font-medium">{message}</p>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-4">
                {result.success.length > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
                    <h3 className="font-semibold text-green-800 mb-2">
                      ✅ Успішно додано ({result.success.length})
                    </h3>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {result.success.map((item, idx) => (
                        <div key={idx} className="text-sm text-green-700">
                          • {item.event}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.errors.length > 0 && (
                  <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
                    <h3 className="font-semibold text-red-800 mb-2">
                      ❌ Помилки ({result.errors.length})
                    </h3>
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {result.errors.map((item, idx) => (
                        <div key={idx} className="text-sm text-red-700">
                          • {item.event}: {item.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Processing Indicator */}
            {processing && (
              <div className="flex items-center justify-center gap-3 p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="text-gray-600 font-medium">Обробка...</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-600">
          <p>💡 Порада: Введіть колонку вашої групи і оберіть дію</p>
        </div>
      </div>
    </div>
  );
}
