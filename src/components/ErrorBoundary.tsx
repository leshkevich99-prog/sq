import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public componentDidMount() {
    window.addEventListener('firestore-error', this.handleFirestoreError as EventListener);
  }

  public componentWillUnmount() {
    window.removeEventListener('firestore-error', this.handleFirestoreError as EventListener);
  }

  private handleFirestoreError = (event: CustomEvent<Error>) => {
    this.setState({ hasError: true, error: event.detail });
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'Произошла непредвиденная ошибка.';
      
      try {
        if (this.state.error?.message) {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.error && parsedError.error.includes('Missing or insufficient permissions')) {
            errorMessage = 'У вас нет прав для выполнения этой операции или доступа к этим данным.';
          } else if (parsedError.error) {
            errorMessage = parsedError.error;
          }
        }
      } catch (e) {
        // Not a JSON error, use the original message if available
        if (this.state.error?.message) {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-red-500/30">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold mb-4">Упс! Что-то пошло не так</h1>
          <p className="text-zinc-400 mb-8 max-w-md">
            {errorMessage}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-black font-bold uppercase tracking-wider py-3 px-8 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Перезагрузить страницу
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
