const axios = require("axios");
const fs = require("fs");
const path = require("path");

const apiUrl = "https://www.ucicinemas.it/rest/v3/cinemas/4/programming";
const scrapedDataFolderPath = "scraped-data";
const updatesFolderPath = "differences-data";
const bearerToken = "SkAkzoScIbhb3uNcGdk8UL0XMIbvs5";

async function getJSON() {
  const { data: jsonData } = await axios.get(apiUrl, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    }
  });
  return jsonData;
}

function saveToFile(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function combineFilmAndEvents(data) {
  const combinedData = [];

  data.forEach((film) => {
    film.events.forEach((event) => {
      const combinedObject = {
        ...film,
        eventId: event.eventId,
        moviePath: event.moviePath,
        movieNew: event.movieNew,
        date: event.date,
        screen: event.performances[0].screen,
        buyUrl: event.performances[0].buyUrl,
        time: event.performances[0].time,
        webUrl: event.webUrl,
      };

      combinedData.push(combinedObject);
    });
  });

  return combinedData;
}

function compareLatestTwoFiles(scrapedDataFolderPath) {
  const scrapedDataFiles = fs.readdirSync(scrapedDataFolderPath);
  const sortedFiles = scrapedDataFiles
    .map((filename) => ({
      name: filename,
      time: fs.statSync(path.join(scrapedDataFolderPath, filename)).birthtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  const [latestFile, penultimateFile] = sortedFiles.slice(0, 2);

  if (latestFile && penultimateFile) {
    const latestFilePath = path.join(scrapedDataFolderPath, latestFile.name);
    const penultimateFilePath = path.join(
      scrapedDataFolderPath,
      penultimateFile.name
    );

    const latestData = fs.existsSync(latestFilePath)
      ? JSON.parse(fs.readFileSync(latestFilePath))
      : [];
    const penultimateData = fs.existsSync(penultimateFilePath)
      ? JSON.parse(fs.readFileSync(penultimateFilePath))
      : [];

    const combinedLatestData = combineFilmAndEvents(latestData);
    const combinedPenultimateData = combineFilmAndEvents(penultimateData);

    const differences = combinedLatestData.filter((latestItem) => {
      const correspondingPenultimateItem = combinedPenultimateData.find(
        (penultimateItem) => JSON.stringify(penultimateItem) === JSON.stringify(latestItem)
      );

      return !correspondingPenultimateItem;
    });

    if (differences.length > 0) {
      console.log("Differences detected.");

      // Creare la combinazione anche per le differences
      const combinedDifferences = combineFilmAndEvents(differences);

      console.log(combinedDifferences)

      // Salvare la combinazione delle differences
      saveDifferencesToFile(combinedDifferences, updatesFolderPath);
    } else {
      console.log("No differences found.");
    }
  } else {
    console.log("Not enough files for comparison.");
  }
}

function saveDifferencesToFile(differences, updatesFolderPath) {
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
  saveToFile(data, newScrapedDataFilePath);
  compareLatestTwoFiles(scrapedDataFolderPath);
});