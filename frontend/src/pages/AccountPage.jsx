import React from 'react';
import TwoFactorSettings from '../components/TwoFactorSettings';
import ApiKeyManagement from './ApiKeyManagement';

const SECTIONS = {
  'two-factor': TwoFactorSettings,
  'api-keys': ApiKeyManagement,
};

/** One section of the signed-in person's own settings (a submenu page of My account) */
const AccountPage = ({ section }) => {
  const Section = SECTIONS[section];
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-gray-900">My Account</h1>
      <div className="rounded-lg bg-white p-6 shadow">
        <Section />
      </div>
    </div>
  );
};

export default AccountPage;
