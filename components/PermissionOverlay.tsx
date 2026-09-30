import React from 'react';
import { App as CapacitorApp } from '@capacitor/app';

interface PermissionOverlayProps {
  onDismiss: () => void;
}

export function PermissionOverlay({ onDismiss }: PermissionOverlayProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-[#23211f]/90 backdrop-blur-md">
      <div className="max-w-xs w-full bg-[#2c2a28] rounded-2xl p-8 border border-[#45413e] shadow-2xl text-center flex flex-col gap-6 animate-in fade-in zoom-in duration-300">
        <div className="text-5xl">📂</div>
        <div className="flex flex-col gap-2">
          <h3 className="text-[#fffff0] text-xl font-bold font-literata">Access Denied</h3>
          <p className="text-[#888] text-sm leading-relaxed">
            To find your books and music, CoolRead needs access to your files. Please enable storage permissions in settings.
          </p>
        </div>
        <button
          onClick={() => CapacitorApp.openAppSettings()}
          className="bg-[#fffff0] text-[#23211f] font-bold py-3 px-6 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg"
        >
          Grant Access
        </button>
        <button
          onClick={onDismiss}
          className="text-[#888] hover:text-[#fffff0] text-xs underline underline-offset-4"
        >
          Try scanning anyway
        </button>
      </div>
    </div>
  );
}
