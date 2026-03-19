import React, { useState, useEffect } from 'react';
import { getCurrentBlock, TimeBlock } from '../utils/timeBlocks';

export const RightNowBlock: React.FC = () => {
  const [block, setBlock] = useState<TimeBlock>(getCurrentBlock(new Date().getHours()));
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date();
      setNow(today);
      const currentBlock = getCurrentBlock(today.getHours());
      if (currentBlock.name !== block.name) {
        setBlock(currentBlock);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [block.name]);

  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="right-now-compact">
      <span className="block-emoji">{block.emoji}</span>
      <span className="block-name">{block.name}</span>
      <span className="block-directive">{block.directive}</span>
      <span className="block-time">{timeString}</span>
    </div>
  );
};
