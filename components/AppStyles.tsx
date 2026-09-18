import React from 'react';

interface AppStylesProps {
  appStyle: string;
  theme: 'dark' | 'light';
}

export function AppStyles({ appStyle, theme }: AppStylesProps) {
  const isBimbo = appStyle === 'Bimbo';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isDragon = appStyle === 'Dragon';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';

  const isDarkBimbo = isBimbo && theme === 'dark';
  const isDarkSurf = isSurf && theme === 'dark';
  const isDarkMarcel = isMarcel && theme === 'dark';

  return (
    <>
      <style>{`
        .emoji {
          font-family: initial !important;
          line-height: 1 !important;
          display: inline-block !important;
          vertical-align: middle !important;
          font-style: normal !important;
        }
      `}</style>
      {isBimbo && (
        <style>{`
          /* Default light look for all Bimbo elements: sidebars, panels, header, and page backgrounds */
          .bimbo-mode, .bimbo-mode .bg-\\[\\#23211f\\], .bimbo-mode.bg-\\[\\#23211f\\] { background-color: #FFF0F5 !important; color: #881337 !important; }
          .bimbo-mode .bg-\\[\\#23211f\\]\\/95 { background-color: rgba(255,240,245,0.95) !important; }
          .bimbo-mode .bg-\\[\\#2c2a28\\] { background-color: #FFFFFF !important; }
          .bimbo-mode .bg-\\[\\#363330\\] { background-color: #FFFFFF !important; }
          .bimbo-mode .bg-\\[\\#45413e\\] { background-color: #FBCFE8 !important; }
          
          .bimbo-mode .text-\\[\\#fffff0\\], .bimbo-mode.text-\\[\\#fffff0\\] { color: #881337 !important; }
          .bimbo-mode .text-\\[\\#888\\] { color: #9f1239 !important; }
          .bimbo-mode .text-\\[\\#999\\] { color: #BE123C !important; }
          .bimbo-mode .text-\\[\\#ccc\\] { color: #881337 !important; }
          .bimbo-mode .text-\\[\\#666\\] { color: #BE123C !important; }
          .bimbo-mode .text-\\[\\#444\\] { color: #BE123C !important; }
          
          .bimbo-mode .border-\\[\\#45413e\\] { border-color: #FBCFE8 !important; }
          .bimbo-mode .border-\\[\\#57534e\\] { border-color: #FBCFE8 !important; }
          .bimbo-mode .border-transparent { border-color: transparent !important; }

          /* Preserve Light Theme Sidebars */
          .bimbo-mode .bimbo-sidebar,
          .bimbo-mode .bimbo-sidebar .bg-\\[\\#23211f\\],
          .bimbo-mode .bimbo-sidebar.bg-\\[\\#23211f\\] { background-color: #FFF0F5 !important; }
          .bimbo-mode .bimbo-sidebar .bg-\\[\\#23211f\\]\\/95 { background-color: rgba(255,240,245,0.95) !important; }
          .bimbo-mode .bimbo-sidebar .bg-\\[\\#2c2a28\\],
          .bimbo-mode .bimbo-sidebar.bg-\\[\\#2c2a28\\] { background-color: #FFFFFF !important; }
          .bimbo-mode .bimbo-sidebar .bg-\\[\\#363330\\] { background-color: #FFFFFF !important; }
          .bimbo-mode .bimbo-sidebar .bg-\\[\\#45413e\\] { background-color: #FBCFE8 !important; }
          
          .bimbo-mode .bimbo-sidebar .text-\\[\\#fffff0\\],
          .bimbo-mode .bimbo-sidebar.text-\\[\\#fffff0\\] { color: #881337 !important; }
          .bimbo-mode .bimbo-sidebar .text-\\[\\#888\\] { color: #9f1239 !important; }
          .bimbo-mode .bimbo-sidebar .text-\\[\\#999\\] { color: #BE123C !important; }
          .bimbo-mode .bimbo-sidebar .text-\\[\\#ccc\\] { color: #881337 !important; }
          .bimbo-mode .bimbo-sidebar .text-\\[\\#666\\] { color: #BE123C !important; }
          .bimbo-mode .bimbo-sidebar .text-\\[\\#444\\] { color: #BE123C !important; }
          
          .bimbo-mode .bimbo-sidebar .border-\\[\\#45413e\\] { border-color: #FBCFE8 !important; }
          .bimbo-mode .bimbo-sidebar .border-\\[\\#57534e\\] { border-color: #FBCFE8 !important; }
          .bimbo-mode .bimbo-sidebar .border-transparent { border-color: transparent !important; }
          .bimbo-mode input::placeholder { color: #9f1239 !important; opacity: 0.7 !important; }

          /* Universal class for Bimbo panels */
          .bimbo-mode .bimbo-panel,
          .bimbo-mode .bimbo-panel.bg-\\[\\#23211f\\]\\/95,
          .bimbo-mode .bimbo-panel.bg-\\[\\#23211f\\],
          .bimbo-mode .bg-\\[\\#23211f\\]\\/95.bimbo-panel,
          .bimbo-mode .bg-\\[\\#23211f\\].bimbo-panel {
              background-color: rgba(255, 240, 245, 0.95) !important;
              border-color: #FBCFE8 !important;
              color: #881337 !important;
          }
          .bimbo-mode .bimbo-panel button,
          .bimbo-mode .bimbo-panel span,
          .bimbo-mode .bimbo-panel h2,
          .bimbo-mode .bimbo-panel h3,
          .bimbo-mode .bimbo-panel p,
          .bimbo-mode .bimbo-panel div:not(.h-full):not(.w-full) {
              color: #881337 !important;
          }
          .bimbo-mode .bimbo-panel svg {
              stroke: #881337 !important;
          }
          .bimbo-mode .bimbo-panel .text-\\[\\#888\\],
          .bimbo-mode .bimbo-panel .text-\\[\\#666\\],
          .bimbo-mode .bimbo-panel .text-gray-500 {
              color: #9f1239 !important;
          }
          .bimbo-mode .bimbo-panel .border-\\[\\#45413e\\] {
              border-color: #FBCFE8 !important;
          }

          /* Click background overrides */
          .bimbo-mode .bimbo-sidebar button:hover,
          .bimbo-mode .bimbo-sidebar .hover\\:bg-\\[\\#363330\\]:hover,
          .bimbo-mode .bimbo-sidebar .hover\\:bg-\\[\\#45413e\\]:hover,
          .bimbo-mode .bimbo-sidebar li div div:hover,
          .bimbo-mode .bimbo-sidebar li button:hover,
          .bimbo-mode .bimbo-sidebar li div:hover {
              background-color: #FFF0F5 !important;
              color: #881337 !important;
          }
          .bimbo-mode .bimbo-sidebar .bg-\\[\\#363330\\]:hover,
          .bimbo-mode .bimbo-sidebar .bg-\\[\\#45413e\\]:hover {
              background-color: #FFF0F5 !important;
          }
          .bimbo-mode * {
              -webkit-tap-highlight-color: transparent !important;
          }
        `}</style>
      )}

      {isDarkBimbo && (
        <style>{`
          /* Dark mode is ONLY applied to the reader canvas ("полотно текста") */
          .bimbo-mode .bimbo-reader-canvas,
          .bimbo-mode .bimbo-reader-canvas.bg-\\[\\#1c0f13\\] {
              background-color: #1c0f13 !important;
          }
          
          /* Prevent global light color overrides from affecting text elements inside the reader */
          .bimbo-mode .bimbo-reader-canvas,
          .bimbo-mode .bimbo-reader-canvas .reader-container,
          .bimbo-mode .bimbo-reader-canvas .reader-content,
          .bimbo-mode .bimbo-reader-canvas .reader-content * {
              color: inherit !important;
          }
          
          /* Under dark canvas, default prose is soft light pink */
          .bimbo-mode .bimbo-reader-canvas .reader-content {
              color: #e8cbd5 !important;
          }
        `}</style>
      )}

      {isSurf && (
        <style>{`
          /* Surf mode */
          .surf-mode, .surf-mode .bg-\\[\\#23211f\\], .surf-mode.bg-\\[\\#23211f\\] { background-color: #F0F9FF !important; color: #0C4A6E !important; }
          .surf-mode .bg-\\[\\#23211f\\]\\/95 { background-color: rgba(240, 249, 255, 0.95) !important; }
          .surf-mode .bg-\\[\\#2c2a28\\] { background-color: #FFFFFF !important; }
          .surf-mode .bg-\\[\\#363330\\] { background-color: #FFFFFF !important; }
          .surf-mode .bg-\\[\\#45413e\\] { background-color: #BAE6FD !important; }
          
          .surf-mode .text-\\[\\#fffff0\\], .surf-mode.text-\\[\\#fffff0\\] { color: #0C4A6E !important; }
          .surf-mode .text-\\[\\#888\\] { color: #0369A1 !important; }
          .surf-mode .text-\\[\\#999\\] { color: #0EA5E9 !important; }
          .surf-mode .text-\\[\\#ccc\\] { color: #0C4A6E !important; }
          .surf-mode .text-\\[\\#666\\] { color: #0EA5E9 !important; }
          .surf-mode .text-\\[\\#444\\] { color: #0EA5E9 !important; }
          
          .surf-mode .border-\\[\\#45413e\\] { border-color: #BAE6FD !important; }
          .surf-mode .border-\\[\\#57534e\\] { border-color: #BAE6FD !important; }
          .surf-mode .border-transparent { border-color: transparent !important; }

          /* Preserve Light Theme Sidebars */
          .surf-mode .bimbo-sidebar,
          .surf-mode .bimbo-sidebar .bg-\\[\\#23211f\\],
          .surf-mode .bimbo-sidebar.bg-\\[\\#23211f\\] { background-color: #F0F9FF !important; }
          .surf-mode .bimbo-sidebar .bg-\\[\\#23211f\\]\\/95 { background-color: rgba(240, 249, 255, 0.95) !important; }
          .surf-mode .bimbo-sidebar .bg-\\[\\#2c2a28\\],
          .surf-mode .bimbo-sidebar.bg-\\[\\#2c2a28\\] { background-color: #FFFFFF !important; }
          .surf-mode .bimbo-sidebar .bg-\\[\\#363330\\] { background-color: #FFFFFF !important; }
          .surf-mode .bimbo-sidebar .bg-\\[\\#45413e\\] { background-color: #BAE6FD !important; }
          
          .surf-mode .bimbo-sidebar .text-\\[\\#fffff0\\],
          .surf-mode .bimbo-sidebar.text-\\[\\#fffff0\\] { color: #0C4A6E !important; }
          .surf-mode .bimbo-sidebar .text-\\[\\#888\\] { color: #0369A1 !important; }
          .surf-mode .bimbo-sidebar .text-\\[\\#999\\] { color: #0EA5E9 !important; }
          .surf-mode .bimbo-sidebar .text-\\[\\#ccc\\] { color: #0C4A6E !important; }
          .surf-mode .bimbo-sidebar .text-\\[\\#666\\] { color: #0EA5E9 !important; }
          .surf-mode .bimbo-sidebar .text-\\[\\#444\\] { color: #0EA5E9 !important; }
          
          .surf-mode .bimbo-sidebar .border-\\[\\#45413e\\] { border-color: #BAE6FD !important; }
          .surf-mode .bimbo-sidebar .border-\\[\\#57534e\\] { border-color: #BAE6FD !important; }
          .surf-mode .bimbo-sidebar .border-transparent { border-color: transparent !important; }
          .surf-mode input::placeholder { color: #0369A1 !important; opacity: 0.7 !important; }

          /* Universal class for Surf panels */
          .surf-mode .bimbo-panel,
          .surf-mode .bimbo-panel.bg-\\[\\#23211f\\]\\/95,
          .surf-mode .bimbo-panel.bg-\\[\\#23211f\\],
          .surf-mode .bg-\\[\\#23211f\\]\\/95.bimbo-panel,
          .surf-mode .bg-\\[\\#23211f\\].bimbo-panel {
              background-color: rgba(240, 249, 255, 0.95) !important;
              border-color: #BAE6FD !important;
              color: #0C4A6E !important;
          }
          .surf-mode .bimbo-panel button,
          .surf-mode .bimbo-panel span,
          .surf-mode .bimbo-panel h2,
          .surf-mode .bimbo-panel h3,
          .surf-mode .bimbo-panel p,
          .surf-mode .bimbo-panel div:not(.h-full):not(.w-full) {
              color: #0C4A6E !important;
          }
          .surf-mode .bimbo-panel svg {
              stroke: #0C4A6E !important;
          }
          .surf-mode .bimbo-panel .text-\\[\\#888\\],
          .surf-mode .bimbo-panel .text-\\[\\#666\\],
          .surf-mode .bimbo-panel .text-gray-500 {
              color: #0369A1 !important;
          }
          .surf-mode .bimbo-panel .border-\\[\\#45413e\\] {
              border-color: #BAE6FD !important;
          }

          /* Click background overrides */
          .surf-mode .bimbo-sidebar button:hover,
          .surf-mode .bimbo-sidebar .hover\\:bg-\\[\\#363330\\]:hover,
          .surf-mode .bimbo-sidebar .hover\\:bg-\\[\\#45413e\\]:hover,
          .surf-mode .bimbo-sidebar li div div:hover,
          .surf-mode .bimbo-sidebar li button:hover,
          .surf-mode .bimbo-sidebar li div:hover {
              background-color: #F0F9FF !important;
              color: #0C4A6E !important;
          }
          .surf-mode .bimbo-sidebar .bg-\\[\\#363330\\]:hover,
          .surf-mode .bimbo-sidebar .bg-\\[\\#45413e\\]:hover {
              background-color: #F0F9FF !important;
          }
          .surf-mode * {
              -webkit-tap-highlight-color: transparent !important;
          }
        `}</style>
      )}

      {isDarkSurf && (
        <style>{`
          .surf-mode .bimbo-reader-canvas,
          .surf-mode .bimbo-reader-canvas.bg-\\[\\#111e25\\] {
              background-color: #111e25 !important;
          }
          
          .surf-mode .bimbo-reader-canvas,
          .surf-mode .bimbo-reader-canvas .reader-container,
          .surf-mode .bimbo-reader-canvas .reader-content,
          .surf-mode .bimbo-reader-canvas .reader-content * {
              color: inherit !important;
          }
          
          .surf-mode .bimbo-reader-canvas .reader-content {
              color: #b5cbd6 !important;
          }
        `}</style>
      )}
      {isFF && (
        <style>{`
          .ff-mode, .ff-mode .bg-\\[\\#23211f\\], .ff-mode.bg-\\[\\#23211f\\] { background-color: #0b1d3a !important; }
          .ff-mode .bg-\\[\\#23211f\\]\\/95 { background-color: rgba(11,29,58,0.95) !important; }
          .ff-mode .bg-\\[\\#2c2a28\\] { background-color: #061124 !important; }
          .ff-mode .bg-\\[\\#363330\\] { background-color: #17335e !important; }
          .ff-mode .bg-\\[\\#45413e\\] { background-color: #406da3 !important; }
          
          .ff-mode .text-\\[\\#fffff0\\], .ff-mode.text-\\[\\#fffff0\\] { color: #f0deba !important; }
          .ff-mode .text-\\[\\#888\\] { color: #8faada !important; }
          .ff-mode .text-\\[\\#999\\] { color: #a6c0ea !important; }
          .ff-mode .text-\\[\\#ccc\\] { color: #d0deef !important; }
          .ff-mode .text-\\[\\#666\\] { color: #6486c4 !important; }
          .ff-mode .text-\\[\\#444\\] { color: #4364a1 !important; }
          
          .ff-mode .border-\\[\\#45413e\\] { border-color: rgba(193, 160, 95, 0.4) !important; }
          .ff-mode .border-\\[\\#57534e\\] { border-color: #dfc894 !important; }
          .ff-mode .border-transparent { border-color: transparent !important; }
          .ff-mode input::placeholder { color: #8faada !important; opacity: 0.7 !important; }
        `}</style>
      )}
      {isDragon && (
        <style>{`
          .dragon-mode, .dragon-mode .bg-\\[\\#23211f\\], .dragon-mode.bg-\\[\\#23211f\\] { background-color: #271c19 !important; }
          .dragon-mode .bg-\\[\\#23211f\\]\\/95 { background-color: rgba(39,28,25,0.95) !important; }
          .dragon-mode .bg-\\[\\#2c2a28\\] { background-color: #1a0f0d !important; }
          .dragon-mode .bg-\\[\\#363330\\] { background-color: #4a2511 !important; }
          .dragon-mode .bg-\\[\\#45413e\\] { background-color: #7f1d1d !important; }
          
          .dragon-mode .text-\\[\\#fffff0\\], .dragon-mode.text-\\[\\#fffff0\\] { color: #fcd34d !important; }
          .dragon-mode .text-\\[\\#888\\] { color: #b45309 !important; }
          .dragon-mode .text-\\[\\#999\\] { color: #d97706 !important; }
          .dragon-mode .text-\\[\\#ccc\\] { color: #f59e0b !important; }
          .dragon-mode .text-\\[\\#666\\] { color: #991b1b !important; }
          .dragon-mode .text-\\[\\#444\\] { color: #7f1d1d !important; }
          
          .dragon-mode .border-\\[\\#45413e\\] { border-color: #7f1d1d !important; }
          .dragon-mode .border-\\[\\#57534e\\] { border-color: #991b1b !important; }
          .dragon-mode .border-transparent { border-color: transparent !important; }
          .dragon-mode input::placeholder { color: #b45309 !important; opacity: 0.7 !important; }
        `}</style>
      )}
      {isMarcel && (
        <style>{`
          .marcel-mode, .marcel-mode .bg-\\[\\#23211f\\], .marcel-mode.bg-\\[\\#23211f\\] { background-color: #F3EFFB !important; color: #2F2440 !important; }
          .marcel-mode .bg-\\[\\#23211f\\]\\/95 { background-color: rgba(243, 239, 251, 0.95) !important; }
          .marcel-mode .bg-\\[\\#2c2a28\\] { background-color: #E8E0F5 !important; color: #2F2440 !important; }
          .marcel-mode .bg-\\[\\#363330\\] { background-color: #DBD0EF !important; color: #2F2440 !important; }
          .marcel-mode .bg-\\[\\#45413e\\] { background-color: #C4B5E6 !important; color: #111111 !important; }
          
          .marcel-mode .text-\\[\\#fffff0\\], .marcel-mode.text-\\[\\#fffff0\\] { color: #2F2440 !important; }
          .marcel-mode .text-\\[\\#888\\] { color: #766594 !important; }
          .marcel-mode .text-\\[\\#999\\] { color: #544372 !important; }
          .marcel-mode .text-\\[\\#ccc\\] { color: #544372 !important; }
          .marcel-mode .text-\\[\\#666\\] { color: #9B8EAE !important; }
          .marcel-mode .text-\\[\\#444\\] { color: #9B8EAE !important; }
          
          .marcel-mode .border-\\[\\#45413e\\] { border-color: #C4B5E6 !important; }
          .marcel-mode .border-\\[\\#57534e\\] { border-color: #AC97D7 !important; }
          .marcel-mode .border-transparent { border-color: transparent !important; }
          .marcel-mode input::placeholder { color: #766594 !important; opacity: 0.7 !important; }
          
          .marcel-mode .hover\\:text-\\[\\#fffff0\\]:hover { color: #1A1A1A !important; }
        `}</style>
      )}
      {isDarkMarcel && (
        <style>{`
          .marcel-mode .bimbo-reader-canvas,
          .marcel-mode .bimbo-reader-canvas.bg-\\[\\#1a1918\\],
          .marcel-mode .bimbo-reader-canvas .bg-\\[\\#23211f\\],
          .marcel-mode .bimbo-reader-canvas.bg-\\[\\#23211f\\] { 
              background-color: #1D1410 !important; 
              color: #E6D4C5 !important; 
          }
          .marcel-mode .bimbo-reader-canvas .bg-\\[\\#23211f\\]\\/95 { 
              background-color: rgba(29, 20, 16, 0.95) !important; 
          }
          .marcel-mode .bimbo-reader-canvas .bg-\\[\\#2c2a28\\] { 
              background-color: #291C16 !important; 
              color: #E6D4C5 !important; 
          }
          .marcel-mode .bimbo-reader-canvas .bg-\\[\\#363330\\] { 
              background-color: #38281F !important; 
              color: #E6D4C5 !important; 
          }
          .marcel-mode .bimbo-reader-canvas .bg-\\[\\#45413e\\] { 
              background-color: #4D382B !important; 
              color: #F4EBE1 !important; 
          }
          
          .marcel-mode .bimbo-reader-canvas,
          .marcel-mode .bimbo-reader-canvas * {
              mix-blend-mode: normal !important;
          }
          
          .marcel-mode .bimbo-reader-canvas .text-\\[\\#fffff0\\], 
          .marcel-mode .bimbo-reader-canvas.text-\\[\\#fffff0\\],
          .marcel-mode .bimbo-reader-canvas .reader-content,
          .marcel-mode .bimbo-reader-canvas .reader-content * { 
              color: #E6D4C5 !important; 
          }
          
          .marcel-mode .bimbo-reader-canvas .text-\\[\\#888\\] { color: #C1AF9F !important; }
          .marcel-mode .bimbo-reader-canvas .text-\\[\\#999\\] { color: #D3C1B0 !important; }
          .marcel-mode .bimbo-reader-canvas .text-\\[\\#ccc\\] { color: #D3C1B0 !important; }
          .marcel-mode .bimbo-reader-canvas .text-\\[\\#666\\] { color: #9C8979 !important; }
          .marcel-mode .bimbo-reader-canvas .text-\\[\\#444\\] { color: #9C8979 !important; }
          
          .marcel-mode .bimbo-reader-canvas .border-\\[\\#45413e\\] { border-color: #4D382B !important; }
          .marcel-mode .bimbo-reader-canvas .border-\\[\\#57534e\\] { border-color: #5C4434 !important; }
          .marcel-mode .bimbo-reader-canvas .border-transparent { border-color: transparent !important; }
          
          .marcel-mode .bimbo-reader-canvas .hover\\:text-\\[\\#fffff0\\]:hover { color: #F4EBE1 !important; }
        `}</style>
      )}
    </>
  );
}
