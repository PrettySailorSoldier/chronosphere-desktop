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
    <div className="right-now-block">
      <div className="block-header">
        <span className="block-emoji">{block.emoji}</span>
        <span className="block-name">{block.name}</span>
      </div>
      <div className="block-directive">
        {block.directive}
      </div>
      <div className="block-time">
        {timeString}
      </div>
    </div>
  );
};
