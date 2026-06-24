'use client';

import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
        <div className="glass-4 animate-pop relative w-full max-w-md transform rounded-2xl p-6 text-secondary transition-all">
          {title && (
            <h3 className="text-lg font-semibold text-primary mb-4">{title}</h3>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
