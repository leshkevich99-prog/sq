import React from 'react';

interface BynIconProps {
  className?: string;
  size?: number | string;
}

/**
 * Official Belarusian Ruble (BYN) symbol icon from NBRB.
 * Uses mask-image to inherit text color.
 */
export const BynIcon: React.FC<BynIconProps> = ({ className = "", size = "1.1em" }) => {
  return (
    <svg 
      viewBox="0 0 360.67 456.4" 
      width={size} 
      height={size} 
      className={`inline-block align-middle fill-current overflow-visible ${className}`}
      aria-label="Br"
    >
      <path d="M475.61,528.84c0-72.5-62.75-131.27-140.16-131.27H227.58V263.37H426v-49.6H178v290h-63.1v49.7H178V660.17h49.54l107.92-.07c77.36,0,140.11-58.77,140.11-131.26Zm-248-25.1V447.1c35.89,0,72.35.07,107.87.07,50,0,90.56,36.57,90.56,81.67s-40.54,81.67-90.56,81.7l-107.87,0V553.44h112.7v-49.7Z" transform="translate(-114.94 -213.77)"/>
    </svg>
  );
};
