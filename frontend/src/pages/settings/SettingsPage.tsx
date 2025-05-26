import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export function SettingsPage() {
  const { logout } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [theme, setTheme] = useState('light');

  const handleNotificationToggle = () => {
    setNotificationsEnabled(!notificationsEnabled);
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <div className="space-y-6">
        {/* Notifications */}
        <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
          <div>
            <h3 className="font-medium">Notifications</h3>
            <p className="text-sm text-gray-500">Enable or disable notifications</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={notificationsEnabled}
              onChange={handleNotificationToggle}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* Theme */}
        <div className="p-4 bg-white rounded-lg shadow">
          <h3 className="font-medium mb-2">Theme</h3>
          <p className="text-sm text-gray-500 mb-4">Choose your preferred theme</p>
          <div className="flex gap-4">
            <button
              onClick={() => handleThemeChange('light')}
              className={`px-4 py-2 rounded ${
                theme === 'light'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Light
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`px-4 py-2 rounded ${
                theme === 'dark'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Dark
            </button>
          </div>
        </div>

        {/* Account */}
        <div className="p-4 bg-white rounded-lg shadow">
          <h3 className="font-medium mb-4">Account</h3>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
