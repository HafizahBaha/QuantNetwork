import React from 'react';
import { Download } from 'lucide-react';

interface IconProps {
  className?: string;
  size?: number;
}

export const DownloadIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', size }) => {
  return <Download className={className} size={size} />;
};

export default DownloadIcon;
