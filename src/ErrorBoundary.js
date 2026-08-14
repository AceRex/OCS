import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: '20px', background: 'black', height: '100vh', zIndex: 9999, overflow: 'auto' }}>
          <h1>React Crashed</h1>
          <pre>{this.state.error && this.state.error.toString()}</pre>
          <pre>{this.state.error && this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children; 
  }
}
