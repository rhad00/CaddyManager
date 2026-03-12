import { Toaster } from 'react-hot-toast';

/**
 * Global toast container — render once at the app root.
 */
const ToastProvider = () => (
  <Toaster
    position="top-right"
    toastOptions={{
      duration: 4000,
      style: {
        borderRadius: '8px',
        background: '#333',
        color: '#fff',
        fontSize: '14px',
      },
      success: {
        iconTheme: { primary: '#10B981', secondary: '#fff' },
      },
      error: {
        duration: 6000,
        iconTheme: { primary: '#EF4444', secondary: '#fff' },
      },
    }}
  />
);

export default ToastProvider;
