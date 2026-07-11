import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';

export default function VirtualAgentCard({ agent }) {
  const [tiltStyle, setTiltStyle] = useState({});
  const [hologramPos, setHologramPos] = useState({ x: 50, y: 50 });
  const cardRef = useRef(null);

  if (!agent) return null;

  // Deterministic Avatar Glyph Generator
  const getAvatarConfig = (slug) => {
    let hash = 0;
    const str = slug || 'AGENT';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const shapes = ['circle', 'hexagon', 'diamond'];
    const colors = ['#00f0ff', '#bf5fff', '#ffd700', '#39ff14'];
    
    // Choose icon based on permission matching
    let icon = '🤖';
    const lowerSlug = str.toLowerCase();
    if (lowerSlug.includes('travel')) icon = '✈️';
    else if (lowerSlug.includes('shop') || lowerSlug.includes('buy')) icon = '🛒';
    else if (lowerSlug.includes('research') || lowerSlug.includes('read')) icon = '🔍';
    else if (lowerSlug.includes('calendar')) icon = '📅';
    else if (lowerSlug.includes('email')) icon = '📧';
    else if (lowerSlug.includes('pay')) icon = '💳';

    const shape = shapes[Math.abs(hash) % shapes.length];
    const color = colors[Math.abs(hash >> 2) % colors.length];
    return { shape, color, icon };
  };

  const avatar = getAvatarConfig(agent.agent_type_slug || agent.name);

  // Parallax Mouse Tilt handler
  const handleMouseMove = (e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const px = (x / rect.width) * 100;
    const py = (y / rect.height) * 100;
    
    const rotateX = -(py - 50) * 0.22; // Max 11 degrees
    const rotateY = (px - 50) * 0.22;  // Max 11 degrees

    setTiltStyle({
      transform: `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.025)`,
      transition: 'transform 0.05s ease-out'
    });
    setHologramPos({
      x: 100 - px,
      y: 100 - py
    });
  };

  const handleMouseLeave = () => {
    setTiltStyle({
      transform: 'perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)',
      transition: 'transform 0.4s ease'
    });
    setHologramPos({ x: 50, y: 50 });
  };

  // SVG QR Code Look Generator
  const renderQR = (data) => {
    return (
      <svg width="46" height="46" viewBox="0 0 25 25" style={{ background: '#fff', padding: 2, borderRadius: 3 }}>
        <rect x="0" y="0" width="7" height="7" fill="#000" />
        <rect x="1" y="1" width="5" height="5" fill="#fff" />
        <rect x="2" y="2" width="3" height="3" fill="#000" />

        <rect x="18" y="0" width="7" height="7" fill="#000" />
        <rect x="19" y="1" width="5" height="5" fill="#fff" />
        <rect x="20" y="2" width="3" height="3" fill="#000" />

        <rect x="0" y="18" width="7" height="7" fill="#000" />
        <rect x="1" y="19" width="5" height="5" fill="#fff" />
        <rect x="2" y="20" width="3" height="3" fill="#000" />

        <rect x="9" y="1" width="2" height="2" fill="#000" />
        <rect x="13" y="2" width="1" height="3" fill="#000" />
        <rect x="15" y="0" width="2" height="2" fill="#000" />
        <rect x="8" y="9" width="3" height="1" fill="#000" />
        <rect x="12" y="7" width="2" height="4" fill="#000" />
        <rect x="16" y="10" width="4" height="2" fill="#000" />
        <rect x="9" y="14" width="2" height="3" fill="#000" />
        <rect x="14" y="15" width="3" height="1" fill="#000" />
        <rect x="22" y="13" width="2" height="2" fill="#000" />
        <rect x="10" y="22" width="4" height="2" fill="#000" />
        <rect x="16" y="20" width="2" height="3" fill="#000" />
        <rect x="21" y="21" width="3" height="2" fill="#000" />
      </svg>
    );
  };

  const handleDownload = () => {
    const card = cardRef.current;
    if (!card) return;
    html2canvas(card, {
      backgroundColor: null,
      useCORS: true,
      scale: 2
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = `agent-card-${agent.id || agent.agent_id}.png`;
      link.href = canvas.toDataURL();
      link.click();
    });
  };

  const handleCopyLink = () => {
    const verificationUrl = `http://localhost:5173/verify/${agent.id || agent.agent_id}`;
    navigator.clipboard.writeText(verificationUrl).then(() => {
      alert('Verification link copied to clipboard!');
    });
  };

  // Format date nicely
  const getIssuedDate = () => {
    if (agent.created_at) {
      return new Date(agent.created_at).toLocaleDateString();
    }
    return new Date().toLocaleDateString();
  };

  const isOnline = agent.status === 'active';
  const displayId = agent.id || agent.agent_id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {/* 3D Parallax Holographic Card */}
      <div
        ref={cardRef}
        className="y2k-agent-card"
        style={{
          width: 340,
          height: 214,
          borderRadius: 14,
          border: '2px solid rgba(255,255,255,0.4)',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #091a2e 0%, #152b47 100%)',
          boxShadow: '0 12px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 14,
          transformStyle: 'preserve-3d',
          ...tiltStyle
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Holographic Iridescent Band Overlay */}
        <div
          className="y2k-card-hologram"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `linear-gradient(120deg, #ff9ad5 0%, #a0e7ff 35%, #c8ffb0 70%, #ffe28a 100%)`,
            backgroundPosition: `${hologramPos.x}% ${hologramPos.y}%`,
            backgroundSize: '250% 250%',
            opacity: 0.16,
            mixBlendMode: 'color-dodge',
            zIndex: 3
          }}
        />

        {/* Diagonal Gloss glare strip */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '45%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%)',
            pointerEvents: 'none',
            zIndex: 4
          }}
        />

        {/* Top bar strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13 }}>🛡️</span>
            <span className="chrome-text" style={{ fontStyle: 'italic', fontSize: 9, letterSpacing: '1px' }}>
              CERTIFIED AI AGENT
            </span>
          </div>
          <span style={{ fontSize: 9, color: '#a0e7ff', fontFamily: 'var(--font-mono)' }}>SECURE_NET v1.0</span>
        </div>

        {/* Middle contents: Avatar & Info */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, zIndex: 5, marginTop: 10 }}>
          {/* Avatar Glyph */}
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: avatar.shape === 'circle' ? '50%' : avatar.shape === 'hexagon' ? '12px' : '6px',
              border: `2px solid ${avatar.color}`,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              boxShadow: `0 0 10px ${avatar.color}40`,
              transform: avatar.shape === 'diamond' ? 'rotate(45deg)' : 'none',
              flexShrink: 0
            }}
          >
            <span style={{ transform: avatar.shape === 'diamond' ? 'rotate(-45deg)' : 'none' }}>
              {avatar.icon}
            </span>
          </div>

          {/* Info Details */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <h4 className="chrome-text" style={{ fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {agent.name}
            </h4>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#7ee8d8', marginTop: 3 }}>
              {displayId}
            </div>
            <div style={{ fontSize: 9, color: '#adc8e0', marginTop: 2 }}>
              Issued to: <strong style={{ color: '#fff' }}>{agent.owner}</strong>
            </div>
          </div>
        </div>

        {/* Rubber ink stamp effect overlay */}
        <div
          className="y2k-card-stamp"
          style={{
            position: 'absolute',
            right: 18,
            top: 45,
            border: `2.5px double ${isOnline ? 'var(--status-granted)' : 'var(--status-denied)'}`,
            borderRadius: 6,
            padding: '2px 8px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: 13,
            textTransform: 'uppercase',
            color: isOnline ? 'var(--status-granted)' : 'var(--status-denied)',
            transform: 'rotate(-16deg)',
            opacity: 0.8,
            boxShadow: `0 0 8px ${isOnline ? 'var(--status-granted)20' : 'var(--status-denied)20'}`,
            zIndex: 6
          }}
        >
          {isOnline ? 'ACTIVE' : 'REVOKED'}
        </div>

        {/* Bottom bar: QR, Permissions icons, Date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 5, marginTop: 5 }}>
          {/* Permission glyphs row & Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(agent.permissions || []).map(p => {
                let glyph = '⚙️';
                if (p.includes('browse')) glyph = '🔍';
                else if (p.includes('buy') || p.includes('pay')) glyph = '🛒';
                else if (p.includes('calendar')) glyph = '📅';
                else if (p.includes('email')) glyph = '📧';
                else if (p.includes('read')) glyph = '📡';
                else if (p.includes('write')) glyph = '📝';
                return (
                  <span
                    key={p}
                    title={p}
                    style={{
                      fontSize: 11,
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 4,
                      padding: '2px 4px',
                      border: '1px solid rgba(255,255,255,0.15)'
                    }}
                  >
                    {glyph}
                  </span>
                );
              })}
            </div>
            <span style={{ fontSize: 8, color: '#adc8e0' }}>ISSUED: {getIssuedDate()}</span>
          </div>

          {/* Verification QR Code */}
          <div style={{ flexShrink: 0 }}>
            {renderQR(displayId)}
          </div>
        </div>
      </div>

      {/* Action triggers */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="y2k-btn y2k-btn-blue" onClick={handleDownload} style={{ padding: '6px 12px', fontSize: 10 }}>
          💾 Save Card as Image
        </button>
        <button className="y2k-btn y2k-btn-purple" onClick={handleCopyLink} style={{ padding: '6px 12px', fontSize: 10 }}>
          🔗 Copy Verify Link
        </button>
      </div>
    </div>
  );
}
