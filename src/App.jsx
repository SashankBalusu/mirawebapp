import { useEffect, useRef, useState } from 'react'
import './index.css'

function PulseRects({ active }) {
  const stackRef = useRef(null)
  const rectARef = useRef(null)
  const rectBRef = useRef(null)

  const FREQ = 0.95 
  const GAMMA = 6.0
  const EPS = 0.03
  const AMP_BASE = 60   
  const RAMP_IN = 180  
  const RAMP_OUT = 320 

  const ampRef = useRef(0)
  const targetRef = useRef(0)
  const rafRef = useRef(0)
  const tPrevRef = useRef(performance.now())

  const scaledAmpPx = () => {
    const w = stackRef.current?.getBoundingClientRect().width ?? 144
    return AMP_BASE * (w / 144)
  }

  const step = (ts) => {
    const rectA = rectARef.current
    const rectB = rectBRef.current
    if (!rectA || !rectB) {
      rafRef.current = requestAnimationFrame(step)
      return
    }

    const dt = ts - tPrevRef.current
    tPrevRef.current = ts

    const target = targetRef.current
    const ramp = target > ampRef.current ? RAMP_IN : RAMP_OUT
    const k = Math.min(1, dt / ramp)
    ampRef.current += (target - ampRef.current) * (1 - Math.pow(1 - k, 2))

    const t = ts / 1000
    const phase = (t * FREQ) % 1
    const tri = 1 - Math.abs(2 * phase - 1)

    const h = Math.pow(tri, GAMMA)
    const w = (1 - h) * (1 - EPS) + (1 - tri) * EPS
    const sign = phase < 0.5 ? -1 : 1

    const A = scaledAmpPx()
    const d = (A * w * ampRef.current) / Math.SQRT2

    rectA.style.transform = `translate(${sign * -d}px, ${sign * -d}px)`
    rectB.style.transform = `translate(${sign *  d}px, ${sign *  d}px)`

    if (target !== 0 || Math.abs(ampRef.current) > 0.002) {
      rafRef.current = requestAnimationFrame(step)
    } else {
      rectA.style.transform = 'translate(0,0)'
      rectB.style.transform = 'translate(0,0)'
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }

  useEffect(() => {
    targetRef.current = active ? 1 : 0
    if (!rafRef.current) {
      tPrevRef.current = performance.now()
      rafRef.current = requestAnimationFrame(step)
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [active])

  return (
    <div className="pulse-stack" ref={stackRef} aria-hidden="true">
      <div className="rect rect-a" ref={rectARef} />
      <div className="rect rect-b" ref={rectBRef} />
    </div>
  )
}

function MenuSheet({ open, onClose, items, setItems }) {
  const sheetRef = useRef(null)

  useEffect(() => {
    if (open) {
      const first = sheetRef.current?.querySelector('textarea')
      first?.focus({ preventScroll: true })
    }
  }, [open])

  const addItem = () => {
    setItems(prev => [
      ...prev,
      { id: crypto.randomUUID(), text: '', delay: 0 }
    ])
  }

  const updateItem = (id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }

  const deleteItem = (id) => {
    setItems(prev => prev.filter(it => it.id !== id))
  }

  useEffect(() => {
    localStorage.setItem('scriptItems', JSON.stringify(items))
  }, [items])

  return (
    <>
      <div className={`sheet-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside
          className={`sheet ${open ? 'open' : ''}`}
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Voice script"
          onClick={(e) => e.stopPropagation()}  
        >
        <div className="sheet-header">
          <div className="sheet-title">voice script</div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="sheet-body">
          {items.length === 0 && (
            <div className="empty-hint">Add steps below. Each step speaks your text, then waits the delay.</div>
          )}

          <div className="rows">
            {items.map((it, idx) => (
              <div key={it.id} className="row">
                <div className="row-index">{idx + 1}</div>
                <div className="row-fields">
                  <label className="field">
                    <div className="field-label">text</div>
                    <textarea
                      value={it.text}
                      onChange={e => updateItem(it.id, { text: e.target.value })}
                      placeholder="What should Mira say?"
                      rows={2}
                    />
                  </label>
                  <label className="field field-delay">
                    <div className="field-label">delay (s)</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="0.1"
                      value={it.delay}
                      onChange={e => updateItem(it.id, { delay: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <button className="row-delete" onClick={() => deleteItem(it.id)} aria-label="Delete step">🗑</button>
              </div>
            ))}
          </div>

          <div className="sheet-actions">
            <button className="btn add" onClick={addItem}>＋ Add step</button>
          </div>

          <div className="sheet-footer-hint">Tap anywhere on the main page to start/stop playback.</div>
        </div>
      </aside>
    </>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [talking, setTalking] = useState(false)
  const suppressNextClickRef = useRef(false)
  const currentAudioRef = useRef(null);


  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem('scriptItems')
    if (saved) {
      try { return JSON.parse(saved) } catch {}
    }
    return [{ id: crypto.randomUUID(), text: '', delay: 0 }]
  })

  const cancelRef = useRef(false)
  const runningRef = useRef(false)

  const speakOnce = (text, { voice = 'alloy' } = {}) =>
  new Promise(async (resolve) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
        currentAudioRef.current = null;
      }

      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, format: 'mp3' })
      });

      if (!r.ok) {
        console.warn('TTS failed:', await r.text());
        return resolve();
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
        resolve();
      };

      audio.play().catch(() => resolve());
    } catch (e) {
      console.warn(e);
      resolve();
    }
  });

    

  const delayMs = (ms) => new Promise(r => setTimeout(r, ms))

  const stopPlayback = () => {
    cancelRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    setTalking(false);
  };
  const closeMenuAndSuppressNextClick = () => {
    setMenuOpen(false)
    suppressNextClickRef.current = true
    setTimeout(() => { suppressNextClickRef.current = false }, 250)
  }

  const startPlayback = async () => {
    if (runningRef.current) return
    const sequence = items.filter(it => (it.text || '').trim().length > 0)
    if (sequence.length === 0) return
  
    runningRef.current = true
    cancelRef.current = false
  
    try {
      for (const it of sequence) {
        if (cancelRef.current) break
        setTalking(true) 
        await speakOnce(it.text)
        setTalking(false) 
        if (cancelRef.current) break
        const waitMs = Math.max(0, Number(it.delay) * 1000 || 0)
        if (waitMs > 0) await delayMs(waitMs)
      }
    } finally {
      runningRef.current = false
      setTalking(false)
    }
  }

  useEffect(() => {
    const onClick = () => {
      if (menuOpen) return
      if (suppressNextClickRef.current) return
  
      if (talking || runningRef.current) {
        stopPlayback()
      } else {
        startPlayback()
      }
    }
    document.addEventListener('click', onClick, { passive: true })
    return () => document.removeEventListener('click', onClick)
  }, [menuOpen, talking, items])

  const stopPropagation = (e) => e.stopPropagation()

  return (
    <>
      <header className="app-header" onClick={stopPropagation}>
        <button
          className="icon-btn"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path
              d="M26.6666 22.6668C27.7712 22.6668 28.6666 23.5623 28.6666 24.6668C28.6666 25.7714 27.7712 26.6668 26.6666 26.6668H5.33325C4.22868 26.6668 3.33325 25.7714 3.33325 24.6668C3.33325 23.5623 4.22868 22.6668 5.33325 22.6668H26.6666ZM26.6666 14.0002C27.7712 14.0002 28.6666 14.8956 28.6666 16.0002C28.6666 17.1047 27.7712 18.0002 26.6666 18.0002H5.33325C4.22868 18.0002 3.33325 17.1047 3.33325 16.0002C3.33325 14.8956 4.22868 14.0002 5.33325 14.0002H26.6666ZM26.6666 5.3335C27.7712 5.3335 28.6666 6.22893 28.6666 7.3335C28.6666 8.43807 27.7712 9.3335 26.6666 9.3335H5.33325C4.22868 9.3335 3.33325 8.43807 3.33325 7.3335C3.33325 6.22893 4.22868 5.3335 5.33325 5.3335H26.6666Z"
              fill="#0A0A0A" fillOpacity="0.4"
            />
          </svg>
        </button>

        <div className="header-title">talk to mira</div>

        <button className="icon-btn" aria-label="Settings" onClick={stopPropagation}>
          <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <path
              d="M15.9994 2.6958C17.0635 2.6958 17.9653 3.47944 18.1127 4.53304C18.1127 4.53304 18.1135 4.53627 18.114 4.53955C18.115 4.54617 18.1167 4.55811 18.1192 4.57471C18.1242 4.60786 18.1326 4.66018 18.144 4.72966C18.1669 4.86932 18.2028 5.07752 18.2533 5.33643C18.3551 5.85712 18.513 6.5729 18.7377 7.35075C19.2183 9.01463 19.8909 10.5534 20.6687 11.3312C21.4465 12.109 22.9853 12.7816 24.6492 13.2622C25.427 13.4869 26.1428 13.6449 26.6635 13.7466C26.9224 13.7972 27.1306 13.8331 27.2703 13.856C27.3397 13.8673 27.3921 13.8757 27.4252 13.8807C27.4418 13.8832 27.4538 13.8849 27.4604 13.8859C27.4636 13.8864 27.4669 13.8872 27.4669 13.8872H27.4643C28.5189 14.0335 29.3038 14.9345 29.3041 15.9992C29.3041 17.0641 28.5191 17.9648 27.4643 18.1112L27.4656 18.1125L27.4604 18.1138C27.4538 18.1147 27.4418 18.1165 27.4252 18.119C27.3921 18.124 27.3397 18.1323 27.2703 18.1437C27.1306 18.1666 26.9224 18.2025 26.6635 18.2531C26.1428 18.3548 25.427 18.5128 24.6492 18.7375C22.9853 19.2181 21.4465 19.8907 20.6687 20.6685C19.8909 21.4462 19.2183 22.985 18.7377 24.6489C18.513 25.4268 18.3551 26.1426 18.2533 26.6632C18.2028 26.9222 18.1669 27.1304 18.144 27.27C18.1326 27.3395 18.1242 27.3918 18.1192 27.425C18.1167 27.4416 18.115 27.4535 18.114 27.4601C18.1135 27.4634 18.1127 27.4666 18.1127 27.4666C17.9653 28.5202 17.0635 29.3039 15.9994 29.3039C14.9356 29.3036 14.0348 28.52 13.8875 27.4666C13.8875 27.4666 13.8866 27.4634 13.8861 27.4601C13.8852 27.4535 13.8834 27.4416 13.8809 27.425C13.8759 27.3918 13.8676 27.3395 13.8562 27.27C13.8333 27.1304 13.7974 26.9222 13.7468 26.6632C13.6451 26.1426 13.4871 25.4268 13.2625 24.6489C12.7818 22.985 12.1092 21.4462 11.3315 20.6685C10.5537 19.8907 9.01488 19.2181 7.35099 18.7375C6.57314 18.5128 5.85737 18.3548 5.33667 18.2531C5.07776 18.2025 4.86957 18.1666 4.7299 18.1437C4.66043 18.1323 4.6081 18.124 4.57495 18.119C4.55835 18.1165 4.54641 18.1147 4.53979 18.1138C4.53651 18.1133 4.53328 18.1125 4.53328 18.1125C3.47904 17.9656 2.69604 17.0637 2.69604 15.9992C2.69636 14.9345 3.48127 14.0335 4.53589 13.8872H4.53328C4.53328 13.8872 4.53651 13.8864 4.53979 13.8859C4.54641 13.8849 4.55835 13.8832 4.57495 13.8807C4.6081 13.8757 4.66043 13.8673 4.7299 13.856C4.86957 13.8331 5.07776 13.7972 5.33667 13.7466C5.85737 13.6449 6.57314 13.4869 7.35099 13.2622C9.01488 12.7816 10.5537 12.109 11.3315 11.3312C12.1092 10.5534 12.7818 9.01463 13.2625 7.35075C13.4871 6.5729 13.6451 5.85712 13.7468 5.33643C13.7974 5.07752 13.8333 4.86932 13.8562 4.72966C13.8676 4.66018 13.8759 4.60786 13.8809 4.57471C13.8834 4.55811 13.8852 4.54617 13.8861 4.53955C13.8866 4.53627 13.8875 4.53304 13.8875 4.53304C14.0348 3.47965 14.9356 2.69612 15.9994 2.6958ZM15.9994 4.82861C15.9958 4.85436 15.2133 10.4676 12.8406 12.8403L12.6088 13.0591C10.1222 15.2618 4.8538 15.9957 4.82886 15.9992C4.82886 15.9992 10.4624 16.7812 12.8406 19.1593C15.2133 21.5321 15.9959 27.1453 15.9994 27.1711C15.9994 27.1711 16.7814 21.5375 19.1596 19.1593C21.5378 16.7812 27.1713 15.9992 27.1713 15.9992C27.1464 15.9957 21.878 15.2618 19.3914 13.0591L19.1596 12.8403C16.7814 10.4622 15.9994 4.82861 15.9994 4.82861Z"
              fill="#0A0A0A" fillOpacity="0.4"
            />
          </svg>
        </button>
      </header>

      <div className="voice-center" aria-hidden="true">
        {talking ? (
          <PulseRects active={talking} />
        ) : (
          <div className="pulse-stack">
            <div className="rect" />
          </div>
        )}
      </div>

      {!talking && <div className="tap-to-talk">tap to talk</div>}

      <MenuSheet
        open={menuOpen}
        onClose={closeMenuAndSuppressNextClick} 
        items={items}
        setItems={setItems}
      />
    </>
  )
}

export default App
