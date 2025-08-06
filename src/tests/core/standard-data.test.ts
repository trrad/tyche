import { describe, it, expect } from 'vitest';
import {
  StandardData,
  DataQuality,
  UserLevelData,
  DataQualityAnalyzer,
  StandardDataFactory,
  isBinomialData,
  isUserLevelData,
} from '../../core/data';

describe('StandardData Model', () => {
  describe('DataQualityAnalyzer', () => {
    describe('analyzeUserLevel', () => {
      it('should detect zeros in user data', () => {
        const users: UserLevelData[] = [
          { userId: '1', converted: false, value: 0 },
          { userId: '2', converted: true, value: 10 },
          { userId: '3', converted: true, value: 20 },
        ];

        const quality = DataQualityAnalyzer.analyzeUserLevel(users);

        expect(quality.hasZeros).toBe(true);
        expect(quality.hasNegatives).toBe(false);
        expect(quality.missingData).toBe(0);
      });

      it('should detect negative values', () => {
        const users: UserLevelData[] = [
          { userId: '1', converted: true, value: -5 },
          { userId: '2', converted: true, value: 10 },
          { userId: '3', converted: true, value: 20 },
        ];

        const quality = DataQualityAnalyzer.analyzeUserLevel(users);

        expect(quality.hasNegatives).toBe(true);
        expect(quality.hasZeros).toBe(false);
      });

      it('should detect outliers using IQR method', () => {
        // Create data with clear outlier
        const users: UserLevelData[] = [
          { userId: '1', converted: true, value: 10 },
          { userId: '2', converted: true, value: 12 },
          { userId: '3', converted: true, value: 11 },
          { userId: '4', converted: true, value: 13 },
          { userId: '5', converted: true, value: 100 }, // Clear outlier
        ];

        const quality = DataQualityAnalyzer.analyzeUserLevel(users);

        expect(quality.hasOutliers).toBe(true);
      });

      it('should not detect outliers with insufficient data', () => {
        const users: UserLevelData[] = [
          { userId: '1', converted: true, value: 10 },
          { userId: '2', converted: true, value: 100 },
        ];

        const quality = DataQualityAnalyzer.analyzeUserLevel(users);

        expect(quality.hasOutliers).toBe(false);
      });

      it('should count missing data', () => {
        const users: UserLevelData[] = [
          { userId: '1', converted: true, value: 10 },
          { userId: '2', converted: false, value: null as any },
          { userId: '3', converted: false, value: undefined as any },
        ];

        const quality = DataQualityAnalyzer.analyzeUserLevel(users);

        expect(quality.missingData).toBe(2);
      });
    });

    describe('analyzeBinomial', () => {
      it('should return clean quality for binomial data', () => {
        const quality = DataQualityAnalyzer.analyzeBinomial(50, 100);

        expect(quality.hasZeros).toBe(false);
        expect(quality.hasNegatives).toBe(false);
        expect(quality.hasOutliers).toBe(false);
        expect(quality.missingData).toBe(0);
      });
    });

    describe('computeEmpiricalStats', () => {
      it('should compute correct statistics', () => {
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const stats = DataQualityAnalyzer.computeEmpiricalStats(values);

        expect(stats.mean).toBe(5.5);
        expect(stats.min).toBe(1);
        expect(stats.max).toBe(10);
        expect(stats.q50).toBe(5.5); // Median of 1-10 is 5.5
        expect(stats.variance).toBeCloseTo(9.17, 2); // Sample variance
      });

      it('should throw error for empty array', () => {
        expect(() => DataQualityAnalyzer.computeEmpiricalStats([])).toThrow(
          'Cannot compute statistics for empty array'
        );
      });
    });
  });

  describe('StandardDataFactory', () => {
    describe('fromBinomial', () => {
      it('should create valid binomial StandardData', () => {
        const data = StandardDataFactory.fromBinomial(75, 150);

        expect(data.type).toBe('binomial');
        expect(data.n).toBe(150);
        expect(data.binomial).toEqual({ successes: 75, trials: 150 });
        expect(data.userLevel).toBeUndefined();
        expect(data.quality.hasZeros).toBe(false);
        expect(data.quality.hasNegatives).toBe(false);
      });
    });

    describe('fromUserLevel', () => {
      it('should create valid user-level StandardData', () => {
        const users: UserLevelData[] = [
          { userId: '1', converted: false, value: 0 },
          { userId: '2', converted: true, value: 25.5 },
          { userId: '3', converted: true, value: 15.75 },
        ];

        const data = StandardDataFactory.fromUserLevel(users);

        expect(data.type).toBe('user-level');
        expect(data.n).toBe(3);
        expect(data.userLevel?.users).toEqual(users);
        expect(data.userLevel?.empiricalStats).toBeDefined();
        expect(data.binomial).toBeUndefined();
        expect(data.quality.hasZeros).toBe(true);
      });

      it('should optionally skip empirical stats computation', () => {
        const users: UserLevelData[] = [{ userId: '1', converted: true, value: 10 }];

        const data = StandardDataFactory.fromUserLevel(users, false);

        expect(data.userLevel?.empiricalStats).toBeUndefined();
      });
    });

    describe('fromContinuous', () => {
      it('should create user-level data where everyone converted', () => {
        const values = [10.5, 25.0, 15.75, 30.25];
        const data = StandardDataFactory.fromContinuous(values, 'test');

        expect(data.type).toBe('user-level');
        expect(data.n).toBe(4);
        expect(data.userLevel?.users).toHaveLength(4);

        // Check that all users are marked as converted
        data.userLevel?.users.forEach((user, index) => {
          expect(user.converted).toBe(true);
          expect(user.value).toBe(values[index]);
          expect(user.userId).toBe(`test_${index}`);
        });

        expect(data.quality.hasZeros).toBe(false);
      });

      it('should handle continuous data with zeros', () => {
        const values = [0, 10, 20, 0, 5];
        const data = StandardDataFactory.fromContinuous(values);

        expect(data.quality.hasZeros).toBe(true);
        expect(data.userLevel?.users.every((u) => u.converted)).toBe(true);
      });
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify binomial data', () => {
      const binomialData = StandardDataFactory.fromBinomial(50, 100);
      const userLevelData = StandardDataFactory.fromContinuous([1, 2, 3]);

      expect(isBinomialData(binomialData)).toBe(true);
      expect(isBinomialData(userLevelData)).toBe(false);

      if (isBinomialData(binomialData)) {
        // TypeScript should know binomial is defined
        expect(binomialData.binomial.successes).toBe(50);
        expect(binomialData.binomial.trials).toBe(100);
      }
    });

    it('should correctly identify user-level data', () => {
      const binomialData = StandardDataFactory.fromBinomial(50, 100);
      const userLevelData = StandardDataFactory.fromContinuous([1, 2, 3]);

      expect(isUserLevelData(userLevelData)).toBe(true);
      expect(isUserLevelData(binomialData)).toBe(false);

      if (isUserLevelData(userLevelData)) {
        // TypeScript should know userLevel is defined
        expect(userLevelData.userLevel.users).toHaveLength(3);
      }
    });
  });

  describe('Data Quality Integration', () => {
    it('should identify compound model candidates', () => {
      // Data with zeros suggests compound models
      const users: UserLevelData[] = [
        { userId: '1', converted: false, value: 0 },
        { userId: '2', converted: false, value: 0 },
        { userId: '3', converted: true, value: 25 },
        { userId: '4', converted: true, value: 30 },
      ];

      const data = StandardDataFactory.fromUserLevel(users);

      expect(data.quality.hasZeros).toBe(true);
      // This would be used by ModelRouter to suggest compound models
    });

    it('should identify mixture model candidates', () => {
      // Data with outliers suggests mixture models
      const users: UserLevelData[] = [
        { userId: '1', converted: true, value: 5 },
        { userId: '2', converted: true, value: 6 },
        { userId: '3', converted: true, value: 7 },
        { userId: '4', converted: true, value: 8 },
        { userId: '5', converted: true, value: 100 }, // Outlier suggests second population
      ];

      const data = StandardDataFactory.fromUserLevel(users);

      expect(data.quality.hasOutliers).toBe(true);
      // This would be used by ModelRouter to suggest mixture models
    });
  });

  describe('Feature Support', () => {
    it('should support user features for future HTE analysis', () => {
      const users: UserLevelData[] = [
        {
          userId: '1',
          converted: true,
          value: 25,
          features: {
            device: 'mobile',
            browser: 'Chrome',
            dayOfWeek: 'Monday',
            hour: 14,
            customSegment: 'premium',
          },
          timestamp: new Date('2023-01-01'),
        },
      ];

      const data = StandardDataFactory.fromUserLevel(users);
      const user = data.userLevel?.users[0];

      expect(user?.features?.device).toBe('mobile');
      expect(user?.features?.customSegment).toBe('premium');
      expect(user?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single user data', () => {
      const users: UserLevelData[] = [{ userId: '1', converted: true, value: 42 }];

      const data = StandardDataFactory.fromUserLevel(users);

      expect(data.n).toBe(1);
      expect(data.quality.hasOutliers).toBe(false); // Can't detect outliers with n=1
      expect(data.userLevel?.empiricalStats?.mean).toBe(42);
    });

    it('should handle all zero values', () => {
      const users: UserLevelData[] = [
        { userId: '1', converted: false, value: 0 },
        { userId: '2', converted: false, value: 0 },
        { userId: '3', converted: false, value: 0 },
      ];

      const data = StandardDataFactory.fromUserLevel(users);

      expect(data.quality.hasZeros).toBe(true);
      expect(data.userLevel?.empiricalStats?.mean).toBe(0);
      expect(data.userLevel?.empiricalStats?.variance).toBe(0);
    });

    it('should handle binomial edge cases', () => {
      // No conversions
      const noConversions = StandardDataFactory.fromBinomial(0, 100);
      expect(noConversions.binomial?.successes).toBe(0);

      // All conversions
      const allConversions = StandardDataFactory.fromBinomial(100, 100);
      expect(allConversions.binomial?.successes).toBe(100);
    });
  });
});
