const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `select * from user where username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    response.status(400).send("User already exists");
    return;
  }
  if (password.length < 6) {
    response.status(400).send("Password is too short");
    return;
  }

  const createUserQuery = `
    insert into user(username, password, name, gender)
    values('${username}', '${hashedPassword}', '${name}', '${gender}');`;

  try {
    const dbResponse = await db.run(createUserQuery);
    const newUserId = dbResponse.lastID;
    response.status(200).send("User created successfully");
  } catch (error) {
    console.error("Error creating user", error);
    response.status(500).send("Internal server error");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `select * from user where username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    const isPasswordValid = await bcrypt.compare(password, dbUser.password);
    if (isPasswordValid) {
      //get jwt Token
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "priya_secret_key");
      response.send({ jwtToken });
    } else {
      response.status(400).send("Invalid password");
    }
  } else {
    response.status(400).send("Invalid user");
  }
});

//authentication with token
function authenticationToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers.authorization;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "priya_secret_key", async (error, payload) => {
      if (error) {
        response.status(401).send("Invalid JWT Token");
      } else {
        next();
      }
    });
  } else {
    response.status(401).send("Invalid JWT Token");
  }
}

const convertDbObject = (objectItem) => {
  return {
    tweetId: objectItem.tweet_id,
    tweet: objectItem.tweet,
    userId: objectItem.user_id,
    dateTime: objectItem.dateTime,
  };
};

// ...

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const authHeader = request.headers.authorization;
    const jwtToken = authHeader.split(" ")[1];

    try {
      const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
      const username = decodedToken.username;

      const followingQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = (SELECT user_id FROM user WHERE username = '${username}')`;
      const followingRows = await db.all(followingQuery);
      const followingUserIds = followingRows.map(
        (row) => row.following_user_id
      );

      const feedQuery = `
      SELECT user.username, tweet.tweet, tweet.date_time
      FROM tweet
      INNER JOIN user ON tweet.user_id = user.user_id
      WHERE tweet.user_id IN (${followingUserIds.join(",")})
      ORDER BY tweet.date_time DESC
      LIMIT 4`;

      const feed = await db.all(feedQuery);
      const formattedFeed = feed.map((item) => ({
        username: item.username,
        tweet: item.tweet,
        dateTime: item.date_time,
      }));

      response.json(formattedFeed);
    } catch (error) {
      console.error("Error fetching tweet feed", error);
      response.status(500).send("Internal server error");
    }
  }
);

// ...
// ...

app.get("/user/following/", authenticationToken, async (request, response) => {
  const authHeader = request.headers.authorization;
  const jwtToken = authHeader.split(" ")[1];

  try {
    const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
    const username = decodedToken.username;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const userRow = await db.get(getUserIdQuery);

    if (!userRow) {
      response.status(404).send("User not found");
      return;
    }

    const userId = userRow.user_id;
    const followingQuery = `
      SELECT user.name
      FROM user
      INNER JOIN follower ON user.user_id = follower.following_user_id
      WHERE follower.follower_user_id = ${userId}`;

    const following = await db.all(followingQuery);
    const formattedFollowing = following.map((item) => ({
      name: item.name,
    }));

    response.json(formattedFollowing);
  } catch (error) {
    console.error("Error fetching following list", error);
    response.status(500).send("Internal server error");
  }
});

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const authHeader = request.headers.authorization;
  const jwtToken = authHeader.split(" ")[1];

  try {
    const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
    const username = decodedToken.username;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const userRow = await db.get(getUserIdQuery);

    if (!userRow) {
      response.status(404).send("User not found");
      return;
    }

    const userId = userRow.user_id;
    const followersQuery = `
      SELECT user.name
      FROM user
      INNER JOIN follower ON user.user_id = follower.follower_user_id
      WHERE follower.following_user_id = ${userId}`;

    const followers = await db.all(followersQuery);
    const formattedFollowers = followers.map((item) => ({
      name: item.name,
    }));

    response.json(formattedFollowers);
  } catch (error) {
    console.error("Error fetching followers list", error);
    response.status(500).send("Internal server error");
  }
});

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const authHeader = request.headers.authorization;
  const jwtToken = authHeader.split(" ")[1];

  try {
    const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
    const username = decodedToken.username;

    const { tweetId } = request.params;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const userRow = await db.get(getUserIdQuery);

    if (!userRow) {
      response.status(404).send("User not found");
      return;
    }

    const userId = userRow.user_id;

    const followingQuery = `
      SELECT following_user_id
      FROM follower
      WHERE follower_user_id = ${userId}`;

    const followingRows = await db.all(followingQuery);
    const followingUserIds = followingRows.map((row) => row.following_user_id);

    const tweetUserQuery = `
      SELECT user_id, tweet, date_time
      FROM tweet
      WHERE tweet_id = ${tweetId}`;

    const tweetUserRow = await db.get(tweetUserQuery);

    if (!tweetUserRow) {
      response.status(404).send("Tweet not found");
      return;
    }

    const tweetUserId = tweetUserRow.user_id;
    const tweet = tweetUserRow.tweet;

    if (!followingUserIds.includes(tweetUserId)) {
      response.status(401).send("Invalid Request");
      return;
    }

    const likesQuery = `
      SELECT COUNT(*) AS likes
      FROM like
      WHERE tweet_id = ${tweetId}`;

    const likesRow = await db.get(likesQuery);
    const likesCount = likesRow.likes;

    const repliesQuery = `
      SELECT COUNT(*) AS replies
      FROM reply
      WHERE tweet_id = ${tweetId}`;

    const repliesRow = await db.get(repliesQuery);
    const repliesCount = repliesRow.replies;

    const responseData = {
      tweet,
      likes: likesCount,
      replies: repliesCount,
      dateTime: tweetUserRow.date_time,
    };

    response.json(responseData);
  } catch (error) {
    console.error("Error fetching tweet", error);
    response.status(500).send("Internal server error");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const authHeader = request.headers.authorization;
    const jwtToken = authHeader.split(" ")[1];

    try {
      const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
      const username = decodedToken.username;

      const { tweetId } = request.params;

      const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
      const userRow = await db.get(getUserIdQuery);

      if (!userRow) {
        response.status(404).send("User not found");
        return;
      }

      const userId = userRow.user_id;

      const followingQuery = `
      SELECT following_user_id
      FROM follower
      WHERE follower_user_id = ${userId}`;

      const followingRows = await db.all(followingQuery);
      const followingUserIds = followingRows.map(
        (row) => row.following_user_id
      );

      const tweetUserQuery = `
      SELECT user_id
      FROM tweet
      WHERE tweet_id = ${tweetId}`;

      const tweetUserRow = await db.get(tweetUserQuery);

      if (!tweetUserRow) {
        response.status(404).send("Tweet not found");
        return;
      }

      const tweetUserId = tweetUserRow.user_id;

      if (!followingUserIds.includes(tweetUserId)) {
        response.status(401).send("Invalid Request");
        return;
      }

      const likesQuery = `
      SELECT user.username AS likes
      FROM like
      INNER JOIN user ON like.user_id = user.user_id
      WHERE like.tweet_id = ${tweetId}`;

      const likesData = await db.all(likesQuery);

      const likes = likesData.map((item) => item.likes);

      const responseData = {
        likes,
      };

      response.json(responseData);
    } catch (error) {
      console.error("Error fetching likes list", error);
      response.status(500).send("Internal server error");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const authHeader = request.headers.authorization;
    const jwtToken = authHeader.split(" ")[1];

    try {
      const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
      const username = decodedToken.username;

      const { tweetId } = request.params;

      const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
      const userRow = await db.get(getUserIdQuery);

      if (!userRow) {
        response.status(404).send("User not found");
        return;
      }
      const userId = userRow.user_id;

      const followingQuery = `
      SELECT following_user_id
      FROM follower
      WHERE follower_user_id = ${userId}`;

      const followingRows = await db.all(followingQuery);
      const followingUserIds = followingRows.map(
        (row) => row.following_user_id
      );

      const tweetUserQuery = `
      SELECT user_id
      FROM tweet
      WHERE tweet_id = ${tweetId}`;

      const tweetUserRow = await db.get(tweetUserQuery);

      if (!tweetUserRow) {
        response.status(404).send("Tweet not found");
        return;
      }

      const tweetUserId = tweetUserRow.user_id;

      if (!followingUserIds.includes(tweetUserId)) {
        response.status(401).send("Invalid Request");
        return;
      }

      const repliesQuery = `
      SELECT user.name, reply.reply
      FROM reply
      INNER JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ${tweetId}`;

      const replies = await db.all(repliesQuery);
      const formattedReplies = replies.map((item) => ({
        name: item.name,
        reply: item.reply,
      }));

      response.json({ replies: formattedReplies });
    } catch (error) {
      console.error("Error fetching tweet replies", error);
      response.status(500).send("Internal server error");
    }
  }
);

// API 9: Get all tweets of the user
// API 9: Get all tweets of the user
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const authHeader = request.headers.authorization;
  const jwtToken = authHeader.split(" ")[1];

  try {
    const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
    const username = decodedToken.username;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const userRow = await db.get(getUserIdQuery);

    if (!userRow) {
      response.status(404).send("User not found");
      return;
    }

    const userId = userRow.user_id;

    const tweetsQuery = `
      SELECT tweet.tweet, COUNT(DISTINCT "like".like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time
      FROM tweet
      LEFT JOIN "like" ON tweet.tweet_id = "like".tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.user_id = ${userId}
      GROUP BY tweet.tweet, tweet.date_time`;

    const tweets = await db.all(tweetsQuery);
    const formattedTweets = tweets.map((item) => ({
      tweet: item.tweet,
      likes: item.likes,
      replies: item.replies,
      dateTime: item.date_time,
    }));

    response.json(formattedTweets);
  } catch (error) {
    console.error("Error fetching user tweets", error);
    response.status(500).send("Internal server error");
  }
});

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const authHeader = request.headers.authorization;
  const jwtToken = authHeader.split(" ")[1];

  try {
    const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
    const username = decodedToken.username;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
    const userRow = await db.get(getUserIdQuery);

    if (!userRow) {
      response.status(404).send("User not found");
      return;
    }

    const userId = userRow.user_id;
    const { tweet } = request.body;

    const insertTweetQuery = `
      INSERT INTO tweet (tweet, user_id, date_time)
      VALUES ('${tweet}', ${userId}, datetime('now'))`;

    await db.run(insertTweetQuery);

    response.send("Created a Tweet");
  } catch (error) {
    console.error("Error creating tweet", error);
    response.status(500).send("Internal server error");
  }
});

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const authHeader = request.headers.authorization;
    const jwtToken = authHeader.split(" ")[1];
    const tweetId = request.params.tweetId;

    try {
      const decodedToken = jwt.verify(jwtToken, "priya_secret_key");
      const username = decodedToken.username;

      const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
      const userRow = await db.get(getUserIdQuery);

      if (!userRow) {
        response.status(404).send("User not found");
        return;
      }

      const userId = userRow.user_id;

      const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet_id = ${tweetId} AND user_id = ${userId}`;

      const result = await db.run(deleteTweetQuery);

      if (result.changes === 0) {
        response.status(401).send("Invalid Request");
      } else {
        response.send("Tweet Removed");
      }
    } catch (error) {
      console.error("Error deleting tweet", error);
      response.status(500).send("Internal server error");
    }
  }
);

module.exports = app;
