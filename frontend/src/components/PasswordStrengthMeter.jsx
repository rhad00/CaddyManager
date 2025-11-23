import { useState, useEffect } from 'react';

/**
 * Password Strength Meter Component
 * Displays visual feedback on password strength
 */
const PasswordStrengthMeter = ({ password }) => {
  const [strength, setStrength] = useState(0);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!password) {
      setStrength(0);
      setFeedback('');
      return;
    }

    const result = calculatePasswordStrength(password);
    setStrength(result.score);
    setFeedback(result.feedback);
  }, [password]);

  const calculatePasswordStrength = (pwd) => {
    let score = 0;
    const feedback = [];

    // Length check
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (pwd.length >= 16) score += 1;

    // Character variety checks
    if (/[a-z]/.test(pwd)) score += 1; // lowercase
    if (/[A-Z]/.test(pwd)) score += 1; // uppercase
    if (/[0-9]/.test(pwd)) score += 1; // numbers
    if (/[^a-zA-Z0-9]/.test(pwd)) score += 1; // special characters

    // Feedback messages
    if (pwd.length < 8) {
      feedback.push('Use at least 8 characters');
    }
    if (!/[a-z]/.test(pwd)) {
      feedback.push('Add lowercase letters');
    }
    if (!/[A-Z]/.test(pwd)) {
      feedback.push('Add uppercase letters');
    }
    if (!/[0-9]/.test(pwd)) {
      feedback.push('Add numbers');
    }
    if (!/[^a-zA-Z0-9]/.test(pwd)) {
      feedback.push('Add special characters');
    }

    // Normalize score to 0-4 range
    const normalizedScore = Math.min(Math.floor(score / 2), 4);

    return {
      score: normalizedScore,
      feedback: feedback.join(', ') || 'Strong password!',
    };
  };

  const getStrengthLabel = () => {
    switch (strength) {
      case 0:
        return 'Very Weak';
      case 1:
        return 'Weak';
      case 2:
        return 'Fair';
      case 3:
        return 'Good';
      case 4:
        return 'Strong';
      default:
        return '';
    }
  };

  const getStrengthColor = () => {
    switch (strength) {
      case 0:
        return 'bg-red-500';
      case 1:
        return 'bg-orange-500';
      case 2:
        return 'bg-yellow-500';
      case 3:
        return 'bg-blue-500';
      case 4:
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStrengthWidth = () => {
    return `${(strength / 4) * 100}%`;
  };

  if (!password) {
    return null;
  }

  return (
    <div className="mt-2">
      {/* Strength bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${getStrengthColor()}`}
          style={{ width: getStrengthWidth() }}
        ></div>
      </div>

      {/* Strength label and feedback */}
      <div className="flex justify-between items-start text-sm">
        <span className={`font-medium ${strength >= 3 ? 'text-green-600' : 'text-gray-600'}`}>
          {getStrengthLabel()}
        </span>
        <span className="text-gray-500 text-xs text-right flex-1 ml-2">{feedback}</span>
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;
