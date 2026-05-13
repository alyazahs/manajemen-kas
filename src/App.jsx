import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabaseClient'
import './App.css'

const DAYS_PER_WEEK = 3
const dayLabels = ['Hari 1', 'Hari 2', 'Hari 3']
const tabs = [
  { id: 'kontribusi', label: 'Kontribusi', icon: 'K' },
  { id: 'anggota', label: 'Anggota', icon: 'A' },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'P' },
  { id: 'ringkasan', label: 'Ringkasan', icon: 'R' },
]

const SUPABASE_ROW_ID = 'default'

const makeContributionRow = () => Array(DAYS_PER_WEEK).fill(false)

const makeWeek = (memberCount) => ({
  contributions: Array.from({ length: memberCount }, makeContributionRow),
  holidays: Array(DAYS_PER_WEEK).fill(false),
  startDate: '',
  endDate: '',
})

const formatCurrency = (amount) => `Rp ${amount.toLocaleString('id-ID')}`

const formatDateShort = (dateValue) => {
  if (!dateValue) return ''

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateValue}T00:00:00`))
}

const getWeekLabel = (week) => {
  if (week.startDate && week.endDate) {
    return `${formatDateShort(week.startDate)} - ${formatDateShort(week.endDate)}`
  }

  if (week.startDate) return formatDateShort(week.startDate)
  if (week.endDate) return formatDateShort(week.endDate)

  return 'Atur tanggal'
}

const normalizeWeek = (week, memberCount) => ({
  ...makeWeek(memberCount),
  ...week,
  startDate: week.startDate || week.date || '',
  endDate: week.endDate || '',
  contributions:
    week.contributions?.map((row) => Array.from({ length: DAYS_PER_WEEK }, (_, index) => Boolean(row?.[index]))) ||
    Array.from({ length: memberCount }, makeContributionRow),
  holidays: Array.from({ length: DAYS_PER_WEEK }, (_, index) => Boolean(week.holidays?.[index])),
})

const normalizeAppData = (data) => {
  const fallback = {
    members: ['Anggota 1', 'Anggota 2', 'Anggota 3', 'Anggota 4', 'Anggota 5', 'Anggota 6'],
    dailyAmount: 10000,
    weeks: [makeWeek(6)],
  }
  const savedMembers = data?.members || fallback.members

  return {
    members: savedMembers,
    dailyAmount: data?.dailyAmount || fallback.dailyAmount,
    weeks: data?.weeks?.map((week) => normalizeWeek(week, savedMembers.length)) || fallback.weeks,
  }
}

const loadSavedData = () => {
  const saved = localStorage.getItem('kasData')
  if (!saved) return normalizeAppData()

  try {
    return normalizeAppData(JSON.parse(saved))
  } catch {
    localStorage.removeItem('kasData')
    return normalizeAppData()
  }
}

function App() {
  const [savedData] = useState(loadSavedData)
  const [members, setMembers] = useState(savedData.members)
  const [dailyAmount, setDailyAmount] = useState(savedData.dailyAmount)
  const [weeks, setWeeks] = useState(savedData.weeks)
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0)
  const [editingMember, setEditingMember] = useState(null)
  const [newMemberName, setNewMemberName] = useState('')
  const [activeTab, setActiveTab] = useState('kontribusi')
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured)
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? 'Menghubungkan Supabase...' : 'Mode lokal')

  useEffect(() => {
    if (!isSupabaseConfigured) return

    const loadCloudData = async () => {
      setSyncStatus('Mengambil data Supabase...')

      const { data, error } = await supabase.from('kas_settings').select('payload').eq('id', SUPABASE_ROW_ID).maybeSingle()

      if (error) {
        setSyncStatus('Supabase gagal dimuat, pakai data lokal')
        setCloudReady(true)
        return
      }

      if (data?.payload) {
        const cloudData = normalizeAppData(data.payload)
        setMembers(cloudData.members)
        setDailyAmount(cloudData.dailyAmount)
        setWeeks(cloudData.weeks)
        setSyncStatus('Data Supabase dimuat')
      } else {
        setSyncStatus('Data lokal siap disimpan ke Supabase')
      }

      setCloudReady(true)
    }

    loadCloudData()
  }, [])

  useEffect(() => {
    localStorage.setItem('kasData', JSON.stringify({ members, dailyAmount, weeks }))
  }, [members, dailyAmount, weeks])

  useEffect(() => {
    if (!isSupabaseConfigured || !cloudReady) return undefined

    const timeoutId = window.setTimeout(async () => {
      setSyncStatus('Menyimpan ke Supabase...')

      const { error } = await supabase.from('kas_settings').upsert({
        id: SUPABASE_ROW_ID,
        payload: { members, dailyAmount, weeks },
        updated_at: new Date().toISOString(),
      })

      setSyncStatus(error ? 'Gagal menyimpan ke Supabase' : 'Tersimpan di database')
    }, 600)

    return () => window.clearTimeout(timeoutId)
  }, [cloudReady, dailyAmount, members, weeks])

  const currentWeek = weeks[currentWeekIndex] || makeWeek(members.length)
  const workingDays = currentWeek.holidays.filter((holiday) => !holiday).length
  const totalSlots = members.length * workingDays

  const totalPaidSlots = useMemo(() => {
    return currentWeek.contributions.reduce((total, row) => {
      const paidDays = row.filter((paid, dayIndex) => paid && !currentWeek.holidays[dayIndex]).length
      return total + paidDays
    }, 0)
  }, [currentWeek])

  const totalKasWeek = totalPaidSlots * dailyAmount
  const totalKasAll = useMemo(() => {
    return weeks.reduce((weekTotal, week) => {
      const paidSlots = week.contributions.reduce((memberTotal, row) => {
        return memberTotal + row.filter((paid, dayIndex) => paid && !week.holidays[dayIndex]).length
      }, 0)
      return weekTotal + paidSlots * dailyAmount
    }, 0)
  }, [dailyAmount, weeks])

  const completionRate = totalSlots ? Math.round((totalPaidSlots / totalSlots) * 100) : 100
  const unpaidSlots = Math.max(totalSlots - totalPaidSlots, 0)
  const unpaidAmountWeek = unpaidSlots * dailyAmount

  const handleCheck = (memberIndex, dayIndex) => {
    setWeeks((previousWeeks) =>
      previousWeeks.map((week, weekIndex) =>
        weekIndex === currentWeekIndex
          ? {
              ...week,
              contributions: week.contributions.map((member, index) =>
                index === memberIndex ? member.map((day, dayKey) => (dayKey === dayIndex ? !day : day)) : member,
              ),
            }
          : week,
      ),
    )
  }

  const toggleHoliday = (dayIndex) => {
    setWeeks((previousWeeks) =>
      previousWeeks.map((week, weekIndex) =>
        weekIndex === currentWeekIndex
          ? { ...week, holidays: week.holidays.map((holiday, index) => (index === dayIndex ? !holiday : holiday)) }
          : week,
      ),
    )
  }

  const updateWeekDate = (field, value) => {
    setWeeks((previousWeeks) =>
      previousWeeks.map((week, weekIndex) => (weekIndex === currentWeekIndex ? { ...week, [field]: value } : week)),
    )
  }

  const addWeek = () => {
    setWeeks((previousWeeks) => [...previousWeeks, makeWeek(members.length)])
    setCurrentWeekIndex(weeks.length)
  }

  const deleteWeek = (index) => {
    if (weeks.length <= 1) return

    const newWeeks = weeks.filter((_, weekIndex) => weekIndex !== index)
    setWeeks(newWeeks)
    if (currentWeekIndex >= newWeeks.length) {
      setCurrentWeekIndex(newWeeks.length - 1)
    }
  }

  const addMember = () => {
    const name = newMemberName.trim()
    if (!name) return

    setMembers((previousMembers) => [...previousMembers, name])
    setNewMemberName('')
    setWeeks((previousWeeks) =>
      previousWeeks.map((week) => ({
        ...week,
        contributions: [...week.contributions, makeContributionRow()],
      })),
    )
  }

  const editMember = (index) => {
    const name = newMemberName.trim()
    if (!name) return

    setMembers((previousMembers) => previousMembers.map((member, memberIndex) => (memberIndex === index ? name : member)))
    setEditingMember(null)
    setNewMemberName('')
  }

  const deleteMember = (index) => {
    setMembers((previousMembers) => previousMembers.filter((_, memberIndex) => memberIndex !== index))
    setWeeks((previousWeeks) =>
      previousWeeks.map((week) => ({
        ...week,
        contributions: week.contributions.filter((_, memberIndex) => memberIndex !== index),
      })),
    )
  }

  const getMemberStatus = (memberIndex) => {
    const paidDays = currentWeek.contributions[memberIndex]?.filter((paid, dayIndex) => !currentWeek.holidays[dayIndex] && paid).length || 0
    const unpaid = Math.max(workingDays - paidDays, 0)

    return {
      isPaid: unpaid === 0,
      paidDays,
      label: unpaid === 0 ? 'Lunas' : `Kurang ${formatCurrency(unpaid * dailyAmount)}`,
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Rp</div>
          <div>
            <h1>Kas Kelas</h1>
            <p>Catatan iuran mingguan</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span className="nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-summary">
          <span>Saldo total</span>
          <strong>{formatCurrency(totalKasAll)}</strong>
          <small>{syncStatus}</small>
        </div>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <span className="eyebrow">Dashboard kas</span>
            <h2>Minggu {currentWeekIndex + 1}</h2>
            <p>{getWeekLabel(currentWeek)} - Kelola iuran, hari libur, anggota, dan ringkasan kas kelas dalam satu tempat.</p>
          </div>
          <div className="hero-stat">
            <span>Progress minggu ini</span>
            <strong>{completionRate}%</strong>
          </div>
        </section>

        <section className="stats-grid" aria-label="Statistik kas">
          <div className="stat-card">
            <span>Kas minggu ini</span>
            <strong>{formatCurrency(totalKasWeek)}</strong>
          </div>
          <div className="stat-card">
            <span>Belum terkumpul</span>
            <strong>{formatCurrency(unpaidAmountWeek)}</strong>
          </div>
          <div className="stat-card">
            <span>Anggota</span>
            <strong>{members.length}</strong>
          </div>
          <div className="stat-card">
            <span>Iuran per hari</span>
            <strong>{formatCurrency(dailyAmount)}</strong>
          </div>
        </section>

        <section className="panel">
          {activeTab === 'kontribusi' && (
            <div className="tab-pane">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Kontribusi</span>
                  <h3>Pilih Minggu</h3>
                </div>
                <div className="week-actions">
                  <button onClick={addWeek} className="btn primary" type="button">Tambah Minggu</button>
                  <button onClick={() => deleteWeek(currentWeekIndex)} disabled={weeks.length <= 1} className="btn danger" type="button">
                    Hapus Minggu
                  </button>
                </div>
              </div>

              <div className="week-tabs">
                {weeks.map((week, index) => (
                  <button
                    key={`${week.startDate}-${week.endDate}-${index}`}
                    onClick={() => setCurrentWeekIndex(index)}
                    className={`week-btn ${index === currentWeekIndex ? 'active' : ''}`}
                    type="button"
                  >
                    <strong>Minggu {index + 1}</strong>
                    <span>{getWeekLabel(week)}</span>
                  </button>
                ))}
              </div>

              <div className="date-range-panel">
                <div>
                  <h4>Tanggal Minggu {currentWeekIndex + 1}</h4>
                  <p>Isi rentang tanggal sesuai jadwal kas, contohnya 11 Mei - 13 Mei.</p>
                </div>
                <div className="date-inputs">
                  <label>
                    <span>Dari</span>
                    <input
                      type="date"
                      value={currentWeek.startDate || ''}
                      onChange={(event) => updateWeekDate('startDate', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Sampai</span>
                    <input
                      type="date"
                      value={currentWeek.endDate || ''}
                      onChange={(event) => updateWeekDate('endDate', event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="holiday-panel">
                <div>
                  <h4>Hari libur</h4>
                  <p>Hari yang ditandai tidak masuk perhitungan iuran.</p>
                </div>
                <div className="days">
                  {dayLabels.map((label, dayIndex) => (
                    <label key={label} className="toggle-pill">
                      <input
                        type="checkbox"
                        checked={currentWeek.holidays[dayIndex]}
                        onChange={() => toggleHoliday(dayIndex)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="members-grid">
                {members.map((member, memberIndex) => {
                  const status = getMemberStatus(memberIndex)

                  return (
                    <article key={`${member}-${memberIndex}`} className="member-card">
                      <div className="member-header">
                        <div>
                          <h4>{member}</h4>
                          <p>{status.paidDays} dari {workingDays} hari terbayar</p>
                        </div>
                        <span className={`status-badge ${status.isPaid ? 'paid' : 'unpaid'}`}>{status.label}</span>
                      </div>
                      <div className="days day-checks">
                        {dayLabels.map((label, dayIndex) => (
                          <label key={label} className={`day-label ${currentWeek.holidays[dayIndex] ? 'disabled' : ''}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(currentWeek.contributions[memberIndex]?.[dayIndex])}
                              onChange={() => handleCheck(memberIndex, dayIndex)}
                              disabled={currentWeek.holidays[dayIndex]}
                            />
                            <span>H{dayIndex + 1}</span>
                          </label>
                        ))}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'anggota' && (
            <div className="tab-pane">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Data anggota</span>
                  <h3>Kelola Anggota</h3>
                </div>
              </div>
              <div className="inline-form">
                <input
                  type="text"
                  placeholder="Nama anggota baru"
                  value={newMemberName}
                  onChange={(event) => setNewMemberName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && addMember()}
                />
                <button onClick={addMember} className="btn primary" type="button">Tambah</button>
              </div>
              <ul className="member-list">
                {members.map((member, index) => (
                  <li key={`${member}-${index}`} className="member-item">
                    {editingMember === index ? (
                      <div className="edit-form">
                        <input
                          type="text"
                          value={newMemberName}
                          onChange={(event) => setNewMemberName(event.target.value)}
                          onBlur={() => editMember(index)}
                          onKeyDown={(event) => event.key === 'Enter' && editMember(index)}
                          autoFocus
                        />
                        <button onClick={() => editMember(index)} className="btn success" type="button">Simpan</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingMember(index)
                            setNewMemberName(member)
                          }}
                          className="member-name"
                          type="button"
                        >
                          {member}
                        </button>
                        <button
                          onClick={() => {
                            setEditingMember(index)
                            setNewMemberName(member)
                          }}
                          className="icon-btn"
                          aria-label={`Edit ${member}`}
                          type="button"
                        >
                          Edit
                        </button>
                        <button onClick={() => deleteMember(index)} className="icon-btn danger" aria-label={`Hapus ${member}`} type="button">
                          Hapus
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'pengaturan' && (
            <div className="tab-pane">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Preferensi</span>
                  <h3>Pengaturan</h3>
                </div>
              </div>
              <div className="settings-grid">
                <label className="setting-card">
                  <span>Jumlah iuran per hari</span>
                  <div className="currency-input">
                    <span>Rp</span>
                    <input
                      type="number"
                      value={dailyAmount}
                      onChange={(event) => setDailyAmount(Number(event.target.value))}
                      min="0"
                    />
                  </div>
                </label>
                <div className="info-card">
                  <h4>Aturan kas</h4>
                  <ul>
                    <li>Iuran dihitung 3 kali dalam satu minggu.</li>
                    <li>Hari libur otomatis dikeluarkan dari tagihan.</li>
                    <li>Data tersimpan otomatis di Supabase jika env sudah diisi.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ringkasan' && (
            <div className="tab-pane">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Laporan singkat</span>
                  <h3>Ringkasan Kas</h3>
                </div>
              </div>
              <div className="summary-list">
                {members.map((member, index) => {
                  const status = getMemberStatus(index)

                  return (
                    <div key={`${member}-${index}`} className="summary-item">
                      <div>
                        <strong>{member}</strong>
                        <span>{status.paidDays} / {workingDays} hari</span>
                      </div>
                      <span className={`status-badge ${status.isPaid ? 'paid' : 'unpaid'}`}>{status.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
