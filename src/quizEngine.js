const { db } = require('./db');

/**
 * Speed bonus factor lookup:
 * 1st place: 100%
 * 2nd place: 85%
 * 3rd place: 70%
 * 4th+ place: 55%
 */
function getSpeedBonusFactor(rank) {
  if (rank === 1) return 1.00;
  if (rank === 2) return 0.85;
  if (rank === 3) return 0.70;
  return 0.55;
}

/**
 * Calculates score for estimation question based on mathematical gradient
 */
function calculateEstimationAccuracy(guess, target, scaleFactor = 100) {
  const diff = Math.abs(guess - target);
  if (diff === 0) return 1.0;
  
  // Use scaleFactor or default to 50% of target if target > 0
  const effectiveScale = (scaleFactor && scaleFactor > 0) 
    ? scaleFactor 
    : Math.max(10, Math.abs(target) * 0.5);

  const accuracy = Math.max(0, 1 - (diff / effectiveScale));
  return Math.round(accuracy * 1000) / 1000; // 3 decimal places
}

/**
 * Settles all submissions for a given slide, applies speed bonuses,
 * updates submission records and updates total scores for all users.
 */
function settleSlideScores(slideId) {
  const slide = db.prepare('SELECT * FROM slides WHERE id = ?').get(slideId);
  if (!slide) return [];

  const submissions = db.prepare(`
    SELECT * FROM quiz_submissions 
    WHERE slide_id = ? 
    ORDER BY submitted_at ASC
  `).all(slideId);

  if (submissions.length === 0) return [];

  const updateStmt = db.prepare(`
    UPDATE quiz_submissions 
    SET is_correct = ?, raw_score = ?, speed_bonus_pct = ?, final_points = ?, rank_in_speed = ?
    WHERE id = ?
  `);

  let speedRank = 1;
  const settledList = [];

  const runSettle = db.transaction(() => {
    if (slide.type === 'multiple_choice') {
      for (const sub of submissions) {
        const isCorrect = (sub.selected_option !== null && sub.selected_option === slide.correct_option_index) ? 1 : 0;
        let speedBonus = 0;
        let rank = 0;
        let rawScore = 0;
        let finalPoints = 0;

        if (isCorrect) {
          rank = speedRank++;
          speedBonus = getSpeedBonusFactor(rank);
          rawScore = slide.max_points || 100;
          finalPoints = Math.round(rawScore * speedBonus);
        }

        updateStmt.run(isCorrect, rawScore, speedBonus, finalPoints, rank, sub.id);
        settledList.push({
          ...sub,
          is_correct: isCorrect,
          raw_score: rawScore,
          speed_bonus_pct: speedBonus,
          final_points: finalPoints,
          rank_in_speed: rank
        });
      }
    } else if (slide.type === 'estimation') {
      const target = slide.target_value;
      const maxPts = slide.max_points || 100;

      for (const sub of submissions) {
        const guess = sub.numeric_value !== null ? sub.numeric_value : parseFloat(sub.answer_text);
        let accuracy = 0;
        let isCorrect = 0;
        let rawScore = 0;
        let speedBonus = 0;
        let rank = 0;
        let finalPoints = 0;

        if (!isNaN(guess)) {
          accuracy = calculateEstimationAccuracy(guess, target, slide.scale_factor || slide.tolerance * 5 || 100);
          if (accuracy > 0) {
            isCorrect = (guess === target) ? 2 : 1; // 2 = exact hit, 1 = close estimate
            rank = speedRank++;
            speedBonus = getSpeedBonusFactor(rank);
            rawScore = Math.round(maxPts * accuracy);
            finalPoints = Math.round(rawScore * speedBonus);
          }
        }

        updateStmt.run(isCorrect, rawScore, speedBonus, finalPoints, rank, sub.id);
        settledList.push({
          ...sub,
          is_correct: isCorrect,
          raw_score: rawScore,
          speed_bonus_pct: speedBonus,
          final_points: finalPoints,
          rank_in_speed: rank
        });
      }
    } else {
      // Info or Action slides
      for (const sub of submissions) {
        updateStmt.run(1, slide.max_points || 0, 1.0, slide.max_points || 0, 1, sub.id);
      }
    }

    // Recalculate total scores for all users from settled submissions
    db.prepare(`
      UPDATE users 
      SET score = COALESCE((
        SELECT SUM(final_points) FROM quiz_submissions WHERE user_id = users.id
      ), 0)
    `).run();
  });

  runSettle();

  return settledList;
}

/**
 * Returns overall leaderboard sorted by score descending
 */
function getLeaderboard() {
  return db.prepare(`
    SELECT id, name, role, avatar_color, avatar_emoji, score, last_seen
    FROM users 
    ORDER BY score DESC, created_at ASC
  `).all();
}

/**
 * Returns detailed slide results for phase 4
 */
function getSlideResults(slideId) {
  return db.prepare(`
    SELECT s.*, u.name as user_name, u.avatar_color, u.avatar_emoji, u.score as total_score
    FROM quiz_submissions s
    JOIN users u ON s.user_id = u.id
    WHERE s.slide_id = ?
    ORDER BY s.final_points DESC, s.submitted_at ASC
  `).all(slideId);
}

module.exports = {
  getSpeedBonusFactor,
  calculateEstimationAccuracy,
  settleSlideScores,
  getLeaderboard,
  getSlideResults
};
