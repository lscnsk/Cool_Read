import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#23211f] text-[#fffff0] flex flex-col items-center justify-center p-6 text-center font-serif">
          <div className="max-w-md bg-[#2c2a28] border border-[#45413e] rounded-2xl p-6 shadow-2xl">
            <span className="text-5xl mb-4 block">📚</span>
            <h1 className="text-xl font-bold mb-2">Произошла ошибка в приложении</h1>
            <p className="text-sm text-[#a8a29e] mb-6">
              {this.state.error?.message || 'Неизвестная ошибка при отображении компонента.'}
            </p>
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-[#45413e] hover:bg-[#57534e] text-[#fffff0] rounded-xl font-medium transition-colors cursor-pointer"
            >
              Перезагрузить приложение
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
