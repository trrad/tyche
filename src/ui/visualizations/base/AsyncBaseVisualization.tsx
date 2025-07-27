import React, { ReactNode } from 'react';
import { BaseVisualizationProps } from './BaseVisualization';
import { useAsyncPosterior, AsyncPosteriorState } from './useAsyncPosterior';
import { Posterior } from '../../../inference/base/types';
import { PosteriorProxy } from '../../../workers/PosteriorProxy';

export interface AsyncVisualizationProps extends BaseVisualizationProps {
  posterior: Posterior | PosteriorProxy | any;
  nSamples?: number;
  children?: (state: AsyncPosteriorState) => ReactNode;
  loadingComponent?: ReactNode;
  errorComponent?: (error: string) => ReactNode;
}

/**
 * Base component for async posterior visualizations
 * Handles loading states, error states, and progress
 */
export const AsyncBaseVisualization: React.FC<AsyncVisualizationProps> = ({
  posterior,
  nSamples = 1000,
  children,
  loadingComponent,
  errorComponent,
  loading: externalLoading,
  error: externalError,
  ...baseProps
}) => {
  const { samples, loading, error, progress } = useAsyncPosterior(posterior, {
    nSamples,
    debounceMs: 100
  });

  // Handle external loading/error states
  const isLoading = externalLoading || loading;
  const displayError = externalError || error;

  // Default loading component
  const defaultLoadingComponent = (
    <div className="flex flex-col items-center justify-center h-64">
      <div className="text-gray-600 mb-2">Generating samples...</div>
      <div className="w-64 bg-gray-200 rounded-full h-2">
        <div 
          className="bg-purple-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="text-sm text-gray-500 mt-1">
        {Math.round(progress)}% complete
      </div>
    </div>
  );

  // Default error component
  const defaultErrorComponent = (err: string) => (
    <div className="flex items-center justify-center h-64">
      <div className="text-red-600">Error: {err}</div>
    </div>
  );

  if (isLoading) {
    return <>{loadingComponent || defaultLoadingComponent}</>;
  }

  if (displayError) {
    return <>{errorComponent ? errorComponent(displayError) : defaultErrorComponent(displayError)}</>;
  }

  if (!samples) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Waiting for data...
      </div>
    );
  }

  // Pass the async state to children
  return <>{children?.({ samples, loading, error, progress })}</>;
};

/**
 * Higher-order component to add async posterior support to any visualization
 */
export function withAsyncPosterior<P extends { posterior: any }>(
  Component: React.ComponentType<P & { samples: number[] }>
) {
  return React.forwardRef<any, P>((props, ref) => {
    const { posterior, ...restProps } = props;
    
    return (
      <AsyncBaseVisualization posterior={posterior} nSamples={1000}>
        {({ samples }) => (
          <Component 
            {...(restProps as any)} 
            posterior={posterior}
            samples={samples!} 
            ref={ref}
          />
        )}
      </AsyncBaseVisualization>
    );
  });
} 