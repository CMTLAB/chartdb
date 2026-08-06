import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { TooltipProvider } from './components/tooltip/tooltip';
import { HelmetData } from './helmet/helmet-data';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/auth-context/auth-provider';
import { LocalConfigProvider } from './context/local-config-context/local-config-provider';
import { ThemeProvider } from './context/theme-context/theme-provider';

export const App = () => {
    return (
        <HelmetProvider>
            <HelmetData />
            <LocalConfigProvider>
                <ThemeProvider>
                    <TooltipProvider>
                        <AuthProvider>
                            <RouterProvider router={router} />
                        </AuthProvider>
                    </TooltipProvider>
                </ThemeProvider>
            </LocalConfigProvider>
        </HelmetProvider>
    );
};
