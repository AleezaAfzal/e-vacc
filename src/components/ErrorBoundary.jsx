import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 520 }}>
          <h1 style={{ color: '#b91c1c' }}>Something went wrong</h1>
          <p>The app hit a runtime error. Open the browser developer console (F12) for details.</p>
          <pre
            style={{
              background: '#f1f5f9',
              padding: '1rem',
              overflow: 'auto',
              fontSize: 13,
            }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
