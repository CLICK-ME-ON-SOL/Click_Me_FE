import React, { useState, useEffect } from 'react';
import { STAKING_TOKEN_MINT } from '@/config';
import ContractAddress from './ContractAddress';
import VersionInfo from './VersionInfo';

const Footer: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkViewport();
    window.addEventListener('resize', checkViewport);
    
    return () => {
      window.removeEventListener('resize', checkViewport);
    };
  }, []);

  // If rendering on server, return empty div to prevent hydration mismatch
  if (!isClient) {
    return <div className="footer-placeholder"></div>;
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 w-full py-2 px-4 sm:px-6 footer-bg z-20">
      <div className="container mx-auto flex flex-col lg:flex-row justify-between items-center">
        {/* Copyright and Version Info */}
        <div className="flex flex-col items-center lg:items-start order-2 lg:order-1">
          <span className="text-xs text-gray-400">
            Click-Me © 2025 All rights reserved
          </span>
          <VersionInfo className="text-xs mt-1" />
        </div>
        
        {/* Contract Address - Using the ContractAddress component */}
        <div className="footer-contract-address w-full lg:w-auto mb-2 lg:mb-0 order-1 lg:order-2">
          <ContractAddress 
            address={STAKING_TOKEN_MINT.toString()} 
            isMobile={isMobile} 
          />
        </div>
        
        {/* Social Links */}
        <div className="flex space-x-3 sm:space-x-4 items-center text-gray-400 order-3">
          {/* DexScreener Logo */}
          <a
            href="https://dexscreener.com/solana/2kmaztm1rtantmjjco9qjhehjgv83aqurwzjmtdzjpc4"
            className="social-link flex items-center"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="DexScreener"
          >
            <div className="social-icon-container">
              <img
                src="https://mediaresource.sfo2.digitaloceanspaces.com/wp-content/uploads/2024/04/20232343/dex-screener-logo-png_seeklogo-527276.png" 
                alt="DexScreener Logo"
                className="social-icon"
                width="16"
                height="16"
              />
            </div>
          </a>
          
          {/* X (Twitter) */}
          <a
            href="https://x.com/ClickMe_app"
            className="social-link flex items-center"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
          >
            <div className="social-icon-container">
              <svg className="social-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
          </a>
          
          {/* Telegram */}
          <a
            href="https://t.me/ClickMePortal"
            className="social-link flex items-center"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram"
          >
            <div className="social-icon-container">
              <svg className="social-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.067l-1.268 5.981c-.091.44-.456.607-.922.37l-2.56-1.89-1.262 1.213c-.138.138-.256.256-.526.256l.188-2.694 4.896-4.428c.215-.184-.043-.294-.335-.11l-6.045 3.805-2.605-.812c-.565-.182-.576-.565.118-.836l10.176-3.923c.47-.176.887.107.736.832z" />
              </svg>
            </div>
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;