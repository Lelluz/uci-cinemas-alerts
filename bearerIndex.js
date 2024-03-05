const axios = require("axios");
const fs = require("fs");
const path = require("path");
const _ = require("lodash");

const apiUrl = "https://www.ucicinemas.it/rest/v3/cinemas/4/programming";
const scrapedDataFolderPath = "scraped-data";
const updatesFolderPath = "differences-data";
const bearerToken = "SkAkzoScIbhb3uNcGdk8UL0XMIbvs5";

async function getJSON() {
  const { data: jsonData } = await axios.get(apiUrl, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  return jsonData;
}

function saveToFile(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function createNewStructure(apiResponse) {
  return _.flatMap(apiResponse, (movie) => {
    return _.flatMap(movie.events, (event) => {
      return event.performances.map((performance) => {
        return {
          movieId: movie.movieId,
          eventId: event.eventId,
          name: movie.name,
          isPurchasable: movie.isPurchasable,
          firstPerformance: movie.firstPerformance,
          date: event.date,
          time: performance.time,
          movieNew: event.movieNew,
          moviePath: event.moviePath,
          screen: performance.screen,
          webUrl: event.webUrl,
          buyUrl: performance.buyUrl,
          moviePosterMedium: movie.moviePosterMedium,
        };
      });
    });
  });
}

function compareAndSaveDifferences(newStructure, latestFilePath, updatesFolderPath) {
  if (fs.existsSync(latestFilePath)) {
    const latestData = JSON.parse(fs.readFileSync(latestFilePath));
    const combinedLatestData = createNewStructure(latestData);

    const differences = _.differenceWith(newStructure, combinedLatestData, _.isEqual);

    if (differences.length > 0) {
      console.log("Differences detected:");

      differences.forEach((diff) => {
        console.log(diff);
      });

      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\./g, "-");
      const differencesFilePath = path.join(
        updatesFolderPath,
        `differences_${timestamp}.json`
      );

      fs.writeFileSync(
        differencesFilePath,
        JSON.stringify(differences, null, 2)
      );
    } else {
      console.log("No differences found.");
    }
  } else {
    console.log("No previous data for comparison.");
  }
}

if (!fs.existsSync(scrapedDataFolderPath)) {
  fs.mkdirSync(scrapedDataFolderPath);
}
if (!fs.existsSync(updatesFolderPath)) {
  fs.mkdirSync(updatesFolderPath);
}

const timestamp = new Date()
  .toISOString()
  .replace(/:/g, "-")
  .replace(/\./g, "-");
const newScrapedDataFilePath = path.join(
  scrapedDataFolderPath,
  `scraped-data_${timestamp}.json`
);

getJSON().then((data) => {
  const newStructure = createNewStructure(data);
  saveToFile(newStructure, newScrapedDataFilePath);

  const scrapedDataFiles = fs.readdirSync(scrapedDataFolderPath);
  const sortedFiles = scrapedDataFiles
    .map((filename) => ({
      name: filename,
      time: fs.statSync(path.join(scrapedDataFolderPath, filename)).birthtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  if (sortedFiles.length > 1) {
    const latestFile = sortedFiles[1];
    const latestFilePath = path.join(scrapedDataFolderPath, latestFile.name);

    compareAndSaveDifferences(newStructure, latestFilePath, updatesFolderPath);
  }
});