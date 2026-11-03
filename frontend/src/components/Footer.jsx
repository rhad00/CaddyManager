import React from 'react';
import { APP_VERSION } from '../utils/version';

const Footer = () => (
  <footer className="bg-white border-t mt-8">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm text-gray-500">
      <div className="flex items-center justify-between">
        <div>© {new Date().getFullYear()} CaddyManager</div>
        <div>{APP_VERSION}</div>
      </div>
    </div>
  </footer>
);

export default Footer;
