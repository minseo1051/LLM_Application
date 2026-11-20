import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import DocumentSources from './DocumentSources'

const firstMessage = {
  role: 'assistant',
  text: '안녕하세요. 내 문서를 바탕으로 질문에 답하는 챗봇입니다.',
}

function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [approved, setApproved] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([firstMessage])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // 로그인 세션은 Supabase가 보관하고, 바뀔 때마다 알려 줍니다.
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setNotice(error.message)
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) checkApproval(session)
    else {
      setApproved(false)
      setMessages([firstMessage])
    }
  }, [session?.user.id])

  async function checkApproval(currentSession) {
    // RLS 덕분에 내 승인 행만 조회됩니다. 없으면 승인 대기입니다.
    const { data, error } = await supabase
      .from('approved_users')
      .select('user_id')
      .eq('user_id', currentSession.user.id)
      .maybeSingle()
    if (error) { setNotice(error.message); return }
    setApproved(Boolean(data))
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setNotice(error ? error.message : '가입했습니다. 관리자 승인을 기다리세요.')
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setNotice(error.message)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setNotice('로그아웃했습니다.')
  }

  async function send(event) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || !session || !approved || loading) return

    setMessages((current) => [...current, { role: 'user', text: trimmed }])
    setQuestion('')
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ question: trimmed }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`)
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: data.answer, sources: data.sources ?? [] },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: `오류: ${error.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <header className="header">
        <span className="eyebrow">KION LABS · LLM 애플리케이션 개발</span>
        <h1>나의 문서 질문 챗봇</h1>
        <p>로그인하고 승인된 사용자만 내 문서에 질문할 수 있습니다.</p>
        {session && <button type="button" onClick={signOut}>로그아웃</button>}
        <p role="status">{notice}</p>
      </header>

      {!authReady && <section className="welcome">로그인 상태 확인 중...</section>}

      {authReady && !session && (
        <section className="welcome auth-panel">
          <h2>회원가입 또는 로그인</h2>
          <label htmlFor="email">이메일</label>
          <input id="email" type="email" value={email}
            onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">비밀번호</label>
          <input id="password" type="password" value={password}
            onChange={(event) => setPassword(event.target.value)} />
          <div className="auth-actions">
            <button type="button" onClick={signUp}>회원가입</button>
            <button type="button" onClick={signIn}>로그인</button>
          </div>
        </section>
      )}

      {session && !approved && (
        <section className="welcome">
          <h2>승인 대기 중</h2>
          <p>관리자가 승인하면 문서와 챗봇을 사용할 수 있습니다.</p>
          <button type="button" onClick={() => checkApproval(session)}>
            승인 상태 새로고침
          </button>
        </section>
      )}

      {session && approved && (
        <>
          <DocumentSources session={session} />

          <section className="chat" aria-label="대화 내용">
            {messages.map((message, index) => (
              <div className={`message ${message.role}`} key={index}>
                <span className="role">{message.role === 'user' ? '나' : '챗봇'}</span>
                <p>{message.text}</p>
                {message.sources?.length > 0 && (
                  <small className="source-note">
                    참고 자료: {message.sources.join(', ')}
                  </small>
                )}
              </div>
            ))}
            {loading && <p className="status">답변을 작성하고 있습니다...</p>}
          </section>

          <form className="composer" onSubmit={send}>
            <label htmlFor="question">질문</label>
            <div className="input-row">
              <input
                id="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="예: Git commit은 무엇인가요?"
                maxLength={500}
              />
              <button type="submit" disabled={loading || !question.trim()}>
                보내기
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  )
}

export default App
