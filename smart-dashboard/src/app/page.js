'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

function getSmartStatus(device) {
  if (!device?.last_seen) return 'OFFLINE'

  const lastSeen = new Date(device.last_seen)
  const now = new Date()
  const diffMinutes = (now - lastSeen) / 1000 / 60

  if (diffMinutes > 5) return 'OFFLINE'

  const status = device.status?.toUpperCase()

  if (status === 'ALERT') return 'ALERT'
  if (status === 'NORMAL') return 'OK'
  if (status === 'OK') return 'OK'

  return 'OK'
}

function getStatusClasses(status) {
  if (status === 'ALERT') return 'bg-red-500/20 text-red-300'
  if (status === 'OFFLINE') return 'bg-yellow-500/20 text-yellow-300'
  return 'bg-green-500/20 text-green-300'
}

function formatLastSeenRelative(dateString) {
  if (!dateString) return '-'

  const lastSeen = new Date(dateString)
  const now = new Date()
  const diffSeconds = Math.floor((now - lastSeen) / 1000)

  if (diffSeconds < 60) return 'agora mesmo'

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `há ${diffMinutes} min`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `há ${diffHours} h`

  const diffDays = Math.floor(diffHours / 24)
  return `há ${diffDays} dias`
}

function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('pt-PT')
}

function formatChartTime(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Home() {
  const [devices, setDevices] = useState([])
  const [readings, setReadings] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const [form, setForm] = useState({
    name: '',
    location: '',
    min_temp: '',
    max_temp: '',
    min_humidity: '',
    max_humidity: '',
    hyst_c: '',
  })

  function fillFormFromDevice(device) {
    const config = device?.config || {}

    setForm({
      name: device?.name || '',
      location: device?.location || '',
  min_temp: config?.temp_low_c ?? '',
  max_temp: config?.temp_high_c ?? '',
  min_humidity: config?.hum_low ?? '',
  max_humidity: config?.hum_high ?? '',
      hyst_c: config?.hyst_c ?? '',
    })
  }

  async function loadData() {
    try {
      const { data: devicesData, error: devicesError } = await supabase
        .from('devices')
        .select('*')
        .order('updated_at', { ascending: false })

      if (devicesError) throw devicesError

      const { data: readingsData, error: readingsError } = await supabase
        .from('readings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (readingsError) throw readingsError

      const { data: alertsData, error: alertsError } = await supabase
        .from('alerts')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(10)

      if (alertsError) throw alertsError

      const finalDevices = devicesData || []
      const finalReadings = readingsData || []
      const finalAlerts = alertsData || []

      setDevices(finalDevices)
      setReadings(finalReadings)
      setAlerts(finalAlerts)

      if (finalDevices.length) {
        setSelectedDeviceId((prev) => prev || finalDevices[0].device_id)
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    const interval = setInterval(() => {
      loadData()
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const selectedDevice =
    devices.find((device) => device.device_id === selectedDeviceId) || devices[0] || null

  useEffect(() => {
    if (selectedDevice && !isEditing) {
      fillFormFromDevice(selectedDevice)
    }
  }, [selectedDeviceId, selectedDevice, isEditing])

  const filteredReadings = useMemo(() => {
    if (!selectedDeviceId) return readings

    return readings
      .filter((reading) => reading.device_id === selectedDeviceId)
      .slice()
      .reverse()
  }, [readings, selectedDeviceId])

  const filteredAlerts = useMemo(() => {
    if (!selectedDeviceId) return alerts
    return alerts.filter((alert) => alert.device_id === selectedDeviceId)
  }, [alerts, selectedDeviceId])

  const chartData = useMemo(() => {
    return filteredReadings.map((reading) => ({
      time: formatChartTime(reading.created_at),
      temperatura: Number(reading.temperature),
      humidade: Number(reading.humidity),
      created_at: reading.created_at,
    }))
  }, [filteredReadings])

  function handleInputChange(event) {
    const { name, value } = event.target

    setIsEditing(true)

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  function handleDeviceChange(event) {
    const nextId = event.target.value
    setSelectedDeviceId(nextId)
    setSaveMessage('')
    setIsEditing(false)
  }

  function handleCancelEdit() {
    if (selectedDevice) {
      fillFormFromDevice(selectedDevice)
    }
    setSaveMessage('')
    setIsEditing(false)
  }

  async function handleSaveConfig() {
  if (!selectedDevice) return

  setSaving(true)
  setSaveMessage('')

  try {
    const currentConfig = selectedDevice.config || {}
    const nextVersion = (selectedDevice.config_version || 0) + 1

    const updatedConfig = {
      ...currentConfig,
      temp_high_c: form.max_temp === '' ? currentConfig.temp_high_c : Number(form.max_temp),
      temp_low_c: form.min_temp === '' ? currentConfig.temp_low_c : Number(form.min_temp),
      hum_high: form.max_humidity === '' ? currentConfig.hum_high : Number(form.max_humidity),
      hum_low: form.min_humidity === '' ? currentConfig.hum_low : Number(form.min_humidity),
      hyst_c: form.hyst_c === '' ? currentConfig.hyst_c : Number(form.hyst_c),
    }

    console.log('selectedDevice.device_id:', selectedDevice.device_id)
    console.log('updatedConfig:', updatedConfig)

    const { data, error } = await supabase
      .from('devices')
      .update({
        name: form.name,
        location: form.location,
        config: updatedConfig,
        config_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('device_id', selectedDevice.device_id)
      .select()

    console.log('save data:', data)
    console.log('save error:', error)

    if (error) throw error

    setSaveMessage('Configuração guardada com sucesso.')
    setIsEditing(false)
    await loadData()
  } catch (error) {
    console.error('Erro ao guardar configuração:', error.message)
    setSaveMessage(`Erro ao guardar configuração: ${error.message}`)
  } finally {
    setSaving(false)
  }
}

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <h1 className="text-3xl font-bold">SmartThermoSecure Dashboard</h1>
        <p className="mt-4 text-slate-300">A carregar dados...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">SmartThermoSecure Dashboard</h1>
          <p className="text-slate-400">Monitorização em tempo quase real</p>
        </div>

        {devices.length > 1 && (
          <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
            <label className="mb-2 block text-sm text-slate-400">Dispositivo selecionado</label>
            <select
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
            >
              {devices.map((device) => (
                <option key={device.device_id} value={device.device_id}>
                  {device.name || device.device_id}
                </option>
              ))}
            </select>
          </section>
        )}

        {selectedDevice && (
          <section className="mb-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {selectedDevice.name || selectedDevice.device_id}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {selectedDevice.location || 'Sem localização'}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClasses(
                    getSmartStatus(selectedDevice)
                  )}`}
                >
                  {getSmartStatus(selectedDevice)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-800 p-4">
                  <p className="text-sm text-slate-400">Temperatura</p>
                  <p className="mt-1 text-3xl font-bold">
                    {selectedDevice.last_temperature ?? '-'}°C
                  </p>
                </div>

                <div className="rounded-xl bg-slate-800 p-4">
                  <p className="text-sm text-slate-400">Humidade</p>
                  <p className="mt-1 text-3xl font-bold">
                    {selectedDevice.last_humidity ?? '-'}%
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-800 p-4">
                  <p className="text-sm text-slate-400">Último contacto</p>
                  <p className="mt-1 font-medium">
                    {formatLastSeenRelative(selectedDevice.last_seen)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-800 p-4">
                  <p className="text-sm text-slate-400">Versão de config</p>
                  <p className="mt-1 font-medium">{selectedDevice.config_version ?? 0}</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-slate-800 p-4">
                <p className="mb-3 text-sm text-slate-400">Configuração ativa</p>

                <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/30 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">
                    Gestão administrativa do dispositivo
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <span className="text-slate-400">Nome</span>
                      <p>{selectedDevice.name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Localização</span>
                      <p>{selectedDevice.location || '-'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Histerese</span>
                      <p>{selectedDevice.config?.hyst_c ?? '-'}°C</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/30 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Parâmetros operacionais</h3>

                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <span className="text-slate-400">Temp min</span>
                      <p>{selectedDevice.config?.min_temp ?? '-'}°C</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Temp max</span>
                      <p>{selectedDevice.config?.max_temp ?? '-'}°C</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Hum min</span>
                      <p>{selectedDevice.config?.min_humidity ?? '-'}%</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Hum max</span>
                      <p>{selectedDevice.config?.max_humidity ?? '-'}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
              <div className="mb-5">
                <h2 className="text-xl font-semibold">Editar configuração</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Atualiza informação de gestão e parâmetros operacionais.
                </p>
              </div>

              <div className="mb-6 rounded-xl border border-slate-800 bg-slate-800/60 p-4">
                <h3 className="mb-2 text-base font-semibold">Gestão administrativa do dispositivo</h3>
                <p className="mb-4 text-sm text-slate-400">
                  Informação interna do equipamento e parâmetros técnicos de controlo.
                </p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Nome</label>
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Localização</label>
                    <input
                      name="location"
                      value={form.location}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Histerese (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      name="hyst_c"
                      value={form.hyst_c}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/60 p-4">
                <h3 className="mb-2 text-base font-semibold">Parâmetros operacionais</h3>
                <p className="mb-4 text-sm text-slate-400">
                  Limites de temperatura e humidade usados para monitorização e alerta.
                </p>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Temperatura mínima</label>
                    <input
                      type="number"
                      step="0.1"
                      name="min_temp"
                      value={form.min_temp}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Temperatura máxima</label>
                    <input
                      type="number"
                      step="0.1"
                      name="max_temp"
                      value={form.max_temp}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Humidade mínima</label>
                    <input
                      type="number"
                      step="1"
                      name="min_humidity"
                      value={form.min_humidity}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">Humidade máxima</label>
                    <input
                      type="number"
                      step="1"
                      name="max_humidity"
                      value={form.max_humidity}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="rounded-xl bg-white px-5 py-3 font-medium text-slate-900 transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'A guardar...' : 'Guardar alterações'}
                </button>

                <button
                  onClick={handleCancelEdit}
                  disabled={saving || !isEditing}
                  className="rounded-xl border border-slate-700 px-5 py-3 font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  Cancelar
                </button>

                {saveMessage && <p className="text-sm text-slate-300">{saveMessage}</p>}
              </div>
            </div>
          </section>
        )}

        <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Histórico e tendências</h2>
            <p className="mt-1 text-sm text-slate-400">
              Evolução recente de temperatura e humidade ao longo do tempo.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-xl bg-slate-800 p-4">
              <h3 className="mb-4 text-lg font-medium">Temperatura</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="temperatura"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl bg-slate-800 p-4">
              <h3 className="mb-4 text-lg font-medium">Humidade</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="humidade"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Alertas recentes</h2>
            <p className="mt-1 text-sm text-slate-400">
              Últimos alertas registados para o dispositivo selecionado.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Dispositivo</th>
                  <th className="py-3 pr-4">Temperatura</th>
                  <th className="py-3 pr-4">Humidade</th>
                  <th className="py-3 pr-4">Data</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.length > 0 ? (
                  filteredAlerts.map((alert) => (
                    <tr key={alert.id} className="border-b border-slate-800/60">
                      <td className="py-3 pr-4">{alert.device_id}</td>
                      <td className="py-3 pr-4">{alert.temperature}°C</td>
                      <td className="py-3 pr-4">{alert.humidity}%</td>
                      <td className="py-3 pr-4">{formatDate(alert.sent_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-slate-400">
                      Sem alertas registados para este dispositivo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-semibold">Últimas leituras</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Dispositivo</th>
                  <th className="py-3 pr-4">Temperatura</th>
                  <th className="py-3 pr-4">Humidade</th>
                  <th className="py-3 pr-4">Data</th>
                </tr>
              </thead>
              <tbody>
                {filteredReadings.map((reading) => (
                  <tr key={reading.id} className="border-b border-slate-800/60">
                    <td className="py-3 pr-4">{reading.device_id}</td>
                    <td className="py-3 pr-4">{reading.temperature}°C</td>
                    <td className="py-3 pr-4">{reading.humidity}%</td>
                    <td className="py-3 pr-4">{formatDate(reading.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}