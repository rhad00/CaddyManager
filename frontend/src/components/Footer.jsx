import React from 'react';
import { APP_VERSION } from '../utils/version';

const Footer = () => (
  <footer className="mt-8 border-t border-gray-200">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 text-sm text-gray-500 sm:px-6 lg:px-8">
      <span>© {new Date().getFullYear()} CaddyManager</span>
      <span className="font-mono text-xs">{APP_VERSION}</span>
    </div>
  </footer>
);

export default Footer;
