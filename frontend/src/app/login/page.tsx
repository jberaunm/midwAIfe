"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { verifyPassword, setAuthToken } from '../lib/auth';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const isValid = await verifyPassword(password);

      if (isValid) {
        setAuthToken();
        router.push('/');
      } else {
        setError('Invalid password. Please try again.');
        setPassword('');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background-color)' }}>
      <div className="max-w-md w-full mx-4">
        <div className="rounded-2xl shadow-2xl p-8" style={{ backgroundColor: 'var(--white)', border: '1px solid var(--border-color)' }}>
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--primary-color)' }}>
              MidwAIfe
            </h1>
            <p style={{ color: 'var(--text-color)', opacity: 0.7 }}>
              Your AI-powered pregnancy companion
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-color)' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-lg transition-all outline-none"
                style={{
                  backgroundColor: 'var(--accent-color)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-color)',
                }}
                disabled={isLoading}
                autoFocus
                required
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--warning-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full font-semibold py-3 px-6 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--primary-color)', color: 'var(--white)' }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-color)', opacity: 0.5 }}>
            Personal access only
          </p>
        </div>
      </div>
    </div>
  );
}
