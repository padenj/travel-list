import React from 'react';

type Props = {
  onUpdate: () => void;
  onDismiss?: () => void;
};

export default function UpdateBanner({ onUpdate, onDismiss }: Props) {
  return (
    <div style={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 2000 }}>
      <div style={{ background: '#fff', border: '1px solid #ddd', padding: '12px 16px', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>Update available</div>
        <div>
          <button onClick={onUpdate} style={{ marginRight: 8, padding: '6px 12px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 4 }}>Refresh</button>
          <button onClick={onDismiss} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #ccc', borderRadius: 4 }}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
